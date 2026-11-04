"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, Turno } from "@/lib/tipos";
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
      const [t, f] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
      ]);
      if (t.error || f.error) {
        setErro(`Não foi possível carregar os dados. Detalhe: ${(t.error ?? f.error)?.message}`);
        return;
      }
      setTurnos((t.data ?? []) as Turno[]);
      setFuncionarios((f.data ?? []) as Funcionario[]);
    }
    if (variaveisConfiguradas()) carregarBase();
  }, []);

  // Escalas da semana mostrada.
  useEffect(() => {
    if (!variaveisConfiguradas()) return;
    let cancelado = false; // evita mostrar a semana errada se trocar rápido
    async function carregarEscalas() {
      const { data, error } = await supabase()
        .from("escalas")
        .select("id, data, turno_id, funcionario_id")
        .gte("data", dias[0])
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
                  return (
                    <td
                      key={d}
                      className={`border-b border-neutral-200 p-1 align-top ${d === hoje ? "bg-amber-50" : ""}`}
                    >
                      <button
                        className="flex min-h-24 w-full flex-col items-stretch gap-1 rounded-lg border border-dashed border-neutral-300 p-1.5 text-left active:bg-neutral-100"
                        onClick={() => setCelula({ data: d, turno: t })}
                        disabled={carregando}
                      >
                        {lista.length === 0 ? (
                          <span className="m-auto text-sm text-neutral-400">+ escalar</span>
                        ) : (
                          lista.map((e) => (
                            <span
                              key={e.id}
                              className="rounded-md bg-neutral-100 px-1.5 py-1 text-sm leading-tight"
                            >
                              {porId.get(e.funcionario_id)?.nome ?? "?"}
                            </span>
                          ))
                        )}
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
