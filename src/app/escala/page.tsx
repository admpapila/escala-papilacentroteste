"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Configuracao, Escala, Funcionario, Regra, Turno } from "@/lib/tipos";
import { lerConfiguracoes, verificarSemana } from "@/lib/regras";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  rotuloDia,
  somarDias,
} from "@/lib/datas";

type Celula = { data: string; turno: Turno };

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Configuracao[]>([]);
  const [semanaCarregada, setSemanaCarregada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(() =>
    variaveisConfiguradas()
      ? null
      : "As variáveis do Supabase não foram configuradas. Veja a página Início.",
  );
  const [celula, setCelula] = useState<Celula | null>(null);
  const [gravando, setGravando] = useState<string | null>(null); // id do funcionário sendo gravado

  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const hoje = hojeISO();
  const carregando = semanaCarregada !== segunda;

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      const db = supabase();
      const [t, f, r, c] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
        db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
        db.from("configuracoes").select("chave, valor"),
      ]);
      if (t.error || f.error) {
        setErro(`Não foi possível carregar os dados. Detalhe: ${(t.error ?? f.error)?.message}`);
        return;
      }
      setTurnos((t.data ?? []) as Turno[]);
      setFuncionarios((f.data ?? []) as Funcionario[]);
      if (r.error || c.error) {
        setErro(`Não foi possível carregar as regras da casa. Detalhe: ${(r.error ?? c.error)?.message}`);
      } else {
        setRegras((r.data ?? []) as Regra[]);
        setConfiguracoes((c.data ?? []) as Configuracao[]);
      }
    }
    if (variaveisConfiguradas()) carregarBase();
  }, []);

  // Escalas da semana mostrada (mais o domingo anterior, para a regra de fechar e abrir).
  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    let cancelado = false; // evita mostrar a semana errada se trocar rápido
    async function carregarEscalas() {
      const { data, error } = await supabase()
        .from("escalas")
        .select("id, data, turno_id, funcionario_id")
        .gte("data", somarDias(dias[0], -1))
        .lte("data", dias[6]);
      if (cancelado) return;
      if (error) setErro(`Não foi possível carregar a escala. Detalhe: ${error.message}`);
      else setEscalas((data ?? []) as Escala[]);
      setSemanaCarregada(dias[0]);
    }
    carregarEscalas();
    return () => {
      cancelado = true;
    };
  }, [dias]);

  const porId = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios]);

  // Regras da casa: alertas recalculados a cada mudança na escala.
  const alertas = useMemo(
    () =>
      carregando || turnos.length === 0
        ? []
        : verificarSemana({
            dias,
            turnos,
            funcionarios,
            escalas,
            config: lerConfiguracoes(regras, configuracoes),
          }),
    [carregando, dias, turnos, funcionarios, escalas, regras, configuracoes],
  );
  const semFolga = useMemo(
    () => new Set(alertas.filter((a) => a.tipo === "folga").map((a) => a.funcionarioId)),
    [alertas],
  );
  function alertasDa(data: string, turnoId: string) {
    return alertas.filter((a) => a.data === data && a.turnoId === turnoId);
  }

  function escaladosEm(data: string, turnoId: string): Escala[] {
    return escalas
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .sort((a, b) =>
        (porId.get(a.funcionario_id)?.nome ?? "").localeCompare(
          porId.get(b.funcionario_id)?.nome ?? "",
        ),
      );
  }

  async function alternar(funcionario: Funcionario) {
    if (!celula) return;
    const { data, turno } = celula;
    const existente = escalas.find(
      (e) => e.data === data && e.turno_id === turno.id && e.funcionario_id === funcionario.id,
    );
    setGravando(funcionario.id);
    setErro(null);
    const db = supabase().from("escalas");
    if (existente) {
      const { error } = await db.delete().eq("id", existente.id);
      if (error) setErro(`Não foi possível remover. Detalhe: ${error.message}`);
      else setEscalas((atual) => atual.filter((e) => e.id !== existente.id));
    } else {
      const { data: nova, error } = await db
        .insert({ data, turno_id: turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) setErro(`Não foi possível salvar. Detalhe: ${error.message}`);
      else setEscalas((atual) => [...atual, nova as Escala]);
    }
    setGravando(null);
  }

  // Na lista da célula: ativos + quem já está escalado (mesmo se desativado depois).
  const opcoes = useMemo(() => {
    if (!celula) return [];
    const escaladosIds = new Set(
      escalas
        .filter((e) => e.data === celula.data && e.turno_id === celula.turno.id)
        .map((e) => e.funcionario_id),
    );
    return funcionarios
      .filter((f) => f.ativo || escaladosIds.has(f.id))
      .map((f) => ({ funcionario: f, marcado: escaladosIds.has(f.id) }));
  }, [celula, escalas, funcionarios]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">
          {diaMes(dias[0])} a {diaMes(dias[6])}/{dias[6].slice(0, 4)}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className="botao-secundario" onClick={() => setSegunda(somarDias(segunda, -7))}>
            ← Anterior
          </button>
          <button className="botao-secundario" onClick={() => setSegunda(somarDias(segunda, 7))}>
            Próxima →
          </button>
        </div>
        {segunda !== inicioDaSemana(hoje) && (
          <button className="botao w-full" onClick={() => setSegunda(inicioDaSemana(hoje))}>
            Voltar para esta semana
          </button>
        )}
      </div>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {!carregando && turnos.length > 0 && (
        <div
          className={`cartao ${alertas.length > 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}
        >
          <p className={`text-lg font-semibold ${alertas.length > 0 ? "text-red-800" : "text-green-800"}`}>
            {alertas.length === 0
              ? "✅ Nenhum alerta nesta semana"
              : `⚠️ ${alertas.length} ${alertas.length === 1 ? "alerta" : "alertas"} nesta semana`}
          </p>
          {alertas.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-red-800">
              {alertas.map((a, i) => (
                <li key={i}>
                  •{" "}
                  {a.data && a.turnoId
                    ? `${rotuloDia(a.data)} · ${turnos.find((t) => t.id === a.turnoId)?.nome}: `
                    : ""}
                  {a.texto}
                </li>
              ))}
            </ul>
          )}
          <Link href="/regras" className="mt-2 inline-block text-sm underline">
            Ver ou mudar as regras da casa
          </Link>
        </div>
      )}

      <p className="text-sm text-neutral-600">
        Toque num quadro para escolher quem trabalha. Arraste para o lado para ver todos os dias.
      </p>

      <div className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm ${carregando ? "opacity-60" : ""}`}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-24 border-b border-r border-neutral-200 bg-white p-2 text-sm">
                Turno
              </th>
              {dias.map((d) => (
                <th
                  key={d}
                  className={`min-w-28 border-b border-neutral-200 p-2 text-center text-sm ${
                    d === hoje ? "bg-amber-100" : ""
                  }`}
                >
                  {rotuloDia(d)}
                  {d === hoje && <span className="block text-xs font-normal">hoje</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id}>
                <th className="sticky left-0 z-[1] border-r border-b border-neutral-200 bg-white p-2 align-top">
                  <span className="block font-semibold">{t.nome}</span>
                  <span className="block text-xs font-normal text-neutral-600">
                    {horaCurta(t.hora_inicio)}–{horaCurta(t.hora_fim)}
                  </span>
                </th>
                {dias.map((d) => {
                  const lista = escaladosEm(d, t.id);
                  const avisos = alertasDa(d, t.id);
                  const fecharam = new Set(avisos.map((a) => a.funcionarioId));
                  return (
                    <td
                      key={d}
                      className={`border-b border-neutral-200 p-1 align-top ${d === hoje ? "bg-amber-50" : ""}`}
                    >
                      <button
                        className={`flex min-h-24 w-full flex-col items-stretch gap-1 rounded-lg p-1.5 text-left ${
                          avisos.length > 0
                            ? "border-2 border-red-500 bg-red-50 active:bg-red-100"
                            : "border border-dashed border-neutral-300 active:bg-neutral-100"
                        }`}
                        onClick={() => setCelula({ data: d, turno: t })}
                        disabled={carregando}
                      >
                        {lista.length === 0 ? (
                          <span className="m-auto text-sm text-neutral-400">+ escalar</span>
                        ) : (
                          lista.map((e) => {
                            const comAlerta =
                              semFolga.has(e.funcionario_id) || fecharam.has(e.funcionario_id);
                            return (
                              <span
                                key={e.id}
                                className={`rounded-md px-1.5 py-1 text-sm leading-tight ${
                                  comAlerta ? "bg-red-200 font-semibold text-red-900" : "bg-neutral-100"
                                }`}
                              >
                                {porId.get(e.funcionario_id)?.nome ?? "?"}
                              </span>
                            );
                          })
                        )}
                        {avisos.map((a, i) => (
                          <span key={i} className="text-xs font-semibold leading-tight text-red-700">
                            ⚠️ {a.texto}
                          </span>
                        ))}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {celula && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setCelula(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold">
              {celula.turno.nome} · {DIAS_SEMANA[paraData(celula.data).getDay()]} {diaMes(celula.data)}
            </h2>
            <p className="mb-3 text-sm text-neutral-600">
              Marque quem trabalha. Cada toque já fica salvo.
            </p>
            {erro && <p className="mb-3 text-red-700">{erro}</p>}
            {alertasDa(celula.data, celula.turno.id).map((a, i) => (
              <p key={i} className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                ⚠️ {a.texto}
              </p>
            ))}
            <ul className="space-y-2">
              {opcoes.map(({ funcionario: f, marcado }) => (
                <li key={f.id}>
                  <label
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${
                      marcado ? "border-[var(--cor-principal)] bg-neutral-50" : "border-neutral-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-6 w-6 shrink-0 accent-[var(--cor-principal)]"
                      checked={marcado}
                      disabled={gravando !== null}
                      onChange={() => alternar(f)}
                    />
                    <span className="flex-1">
                      <span className="block font-semibold">{f.nome}</span>
                      <span className="block text-sm text-neutral-600">
                        {f.funcao}
                        {!f.ativo && " · desativado"}
                      </span>
                    </span>
                    {gravando === f.id && <span className="text-sm text-neutral-500">salvando…</span>}
                  </label>
                </li>
              ))}
            </ul>
            {opcoes.length === 0 && (
              <p className="text-neutral-600">Nenhum funcionário ativo. Cadastre na tela Equipe.</p>
            )}
            <button className="botao mt-4 w-full" onClick={() => setCelula(null)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
