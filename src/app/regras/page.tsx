"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Configuracao, type Regra, type Turno } from "@/lib/tipos";
import { DIAS_SEMANA } from "@/lib/datas";
import { CHAVE_FECHAR_ABRIR, CHAVE_FOLGAS, lerConfiguracoes } from "@/lib/regras";

// Ordem de exibição dos dias: "todos os dias" primeiro, depois segunda a domingo.
const ORDEM_DIAS: (number | null)[] = [null, 1, 2, 3, 4, 5, 6, 0];

function rotuloDiaSemana(dia: number | null): string {
  return dia === null ? "Todos os dias" : DIAS_SEMANA[dia];
}

type NovaRegra = { dia: string; turnoId: string; funcao: string; minimo: number };

export default function RegrasDaCasa() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Configuracao[]>([]);
  const [carregando, setCarregando] = useState(variaveisConfiguradas());
  const [erro, setErro] = useState<string | null>(() =>
    variaveisConfiguradas()
      ? null
      : "As variáveis do Supabase não foram configuradas. Veja a página Início.",
  );
  const [gravando, setGravando] = useState(false);
  const [nova, setNova] = useState<NovaRegra | null>(null);
  const [folgasTexto, setFolgasTexto] = useState("");

  const carregar = useCallback(async () => {
    const db = supabase();
    const [t, r, c] = await Promise.all([
      db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
      db.from("regras").select("id, dia_semana, turno_id, funcao, minimo"),
      db.from("configuracoes").select("chave, valor"),
    ]);
    const falha = t.error ?? r.error ?? c.error;
    if (falha) setErro(`Não foi possível carregar as regras. Detalhe: ${falha.message}`);
    else {
      setTurnos((t.data ?? []) as Turno[]);
      setRegras((r.data ?? []) as Regra[]);
      setConfiguracoes((c.data ?? []) as Configuracao[]);
      setFolgasTexto(String(lerConfiguracoes([], (c.data ?? []) as Configuracao[]).folgasMinimas));
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca dados no banco ao abrir a tela
    if (variaveisConfiguradas()) carregar();
  }, [carregar]);

  const config = useMemo(() => lerConfiguracoes(regras, configuracoes), [regras, configuracoes]);
  const turnoPorId = useMemo(() => new Map(turnos.map((t) => [t.id, t])), [turnos]);

  const regrasOrdenadas = useMemo(
    () =>
      [...regras].sort(
        (a, b) =>
          (turnoPorId.get(a.turno_id)?.ordem ?? 0) - (turnoPorId.get(b.turno_id)?.ordem ?? 0) ||
          ORDEM_DIAS.indexOf(a.dia_semana) - ORDEM_DIAS.indexOf(b.dia_semana) ||
          a.funcao.localeCompare(b.funcao),
      ),
    [regras, turnoPorId],
  );

  const turnosOrdenados = [...turnos].sort((a, b) => a.ordem - b.ordem);
  const abertura = turnosOrdenados[0];
  const fechamento = turnosOrdenados[turnosOrdenados.length - 1];

  async function mudarMinimo(regra: Regra, novoMinimo: number) {
    if (novoMinimo < 1) return;
    setGravando(true);
    setErro(null);
    const { error } = await supabase().from("regras").update({ minimo: novoMinimo }).eq("id", regra.id);
    if (error) setErro(`Não foi possível salvar. Detalhe: ${error.message}`);
    else setRegras((atual) => atual.map((r) => (r.id === regra.id ? { ...r, minimo: novoMinimo } : r)));
    setGravando(false);
  }

  async function remover(regra: Regra) {
    const turno = turnoPorId.get(regra.turno_id)?.nome ?? "";
    if (!confirm(`Remover a regra ${turno} · ${rotuloDiaSemana(regra.dia_semana)} · ${regra.funcao}?`)) return;
    setGravando(true);
    setErro(null);
    const { error } = await supabase().from("regras").delete().eq("id", regra.id);
    if (error) setErro(`Não foi possível remover. Detalhe: ${error.message}`);
    else setRegras((atual) => atual.filter((r) => r.id !== regra.id));
    setGravando(false);
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nova || !nova.turnoId || !nova.funcao.trim()) return;
    setGravando(true);
    setErro(null);
    const { data, error } = await supabase()
      .from("regras")
      .insert({
        dia_semana: nova.dia === "" ? null : Number(nova.dia),
        turno_id: nova.turnoId,
        funcao: nova.funcao.trim(),
        minimo: nova.minimo,
      })
      .select("id, dia_semana, turno_id, funcao, minimo")
      .single();
    if (error) setErro(`Não foi possível adicionar. Detalhe: ${error.message}`);
    else {
      setRegras((atual) => [...atual, data as Regra]);
      setNova(null);
    }
    setGravando(false);
  }

  async function salvarConfiguracao(chave: string, valor: string) {
    setGravando(true);
    setErro(null);
    const { error } = await supabase().from("configuracoes").upsert({ chave, valor });
    if (error) setErro(`Não foi possível salvar. Detalhe: ${error.message}`);
    else
      setConfiguracoes((atual) => [...atual.filter((c) => c.chave !== chave), { chave, valor }]);
    setGravando(false);
  }

  function salvarFolgas() {
    const n = Number(folgasTexto);
    if (!Number.isInteger(n) || n < 0 || n > 7) {
      setErro("As folgas por semana precisam ser um número de 0 a 7.");
      return;
    }
    salvarConfiguracao(CHAVE_FOLGAS, String(n));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Regras da casa</h1>
      <p className="text-neutral-600">
        A Escala da semana mostra um alerta em vermelho quando alguma destas regras não é cumprida.
        Cada mudança aqui já fica salva.
      </p>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}
      {carregando && <p className="text-neutral-600">Carregando…</p>}

      {!carregando && turnos.length > 0 && (
        <>
          <section className="cartao space-y-3">
            <h2 className="text-xl font-bold">Mínimo de pessoas por turno</h2>
            <p className="text-sm text-neutral-600">
              Conta pela função cadastrada na Equipe. A regra de um dia específico vale no lugar da
              regra de &quot;todos os dias&quot;.
            </p>
            {regrasOrdenadas.length === 0 && (
              <p className="text-neutral-600">Nenhuma regra de mínimo cadastrada.</p>
            )}
            <ul className="space-y-2">
              {regrasOrdenadas.map((r) => (
                <li key={r.id} className="rounded-xl border border-neutral-200 p-3">
                  <p className="font-semibold">
                    {turnoPorId.get(r.turno_id)?.nome ?? "?"} · {rotuloDiaSemana(r.dia_semana)}
                  </p>
                  <p className="text-sm text-neutral-600">{r.funcao}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="botao-secundario h-12 w-12 px-0 text-xl"
                      aria-label="Diminuir"
                      disabled={gravando || r.minimo <= 1}
                      onClick={() => mudarMinimo(r, r.minimo - 1)}
                    >
                      −
                    </button>
                    <span className="w-20 text-center text-lg font-semibold">mín. {r.minimo}</span>
                    <button
                      className="botao-secundario h-12 w-12 px-0 text-xl"
                      aria-label="Aumentar"
                      disabled={gravando}
                      onClick={() => mudarMinimo(r, r.minimo + 1)}
                    >
                      +
                    </button>
                    <button
                      className="ml-auto px-2 py-3 text-sm font-semibold text-red-700 underline"
                      disabled={gravando}
                      onClick={() => remover(r)}
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {nova ? (
              <form onSubmit={adicionar} className="space-y-3 rounded-xl border border-neutral-300 p-3">
                <h3 className="font-semibold">Nova regra</h3>
                <label className="block">
                  <span className="mb-1 block text-sm">Dia</span>
                  <select
                    className="campo"
                    value={nova.dia}
                    onChange={(e) => setNova({ ...nova, dia: e.target.value })}
                  >
                    {ORDEM_DIAS.map((d) => (
                      <option key={String(d)} value={d === null ? "" : String(d)}>
                        {rotuloDiaSemana(d)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm">Turno</span>
                  <select
                    className="campo"
                    value={nova.turnoId}
                    onChange={(e) => setNova({ ...nova, turnoId: e.target.value })}
                  >
                    {turnosOrdenados.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm">Função</span>
                  <input
                    className="campo"
                    list="funcoes-padrao"
                    value={nova.funcao}
                    onChange={(e) => setNova({ ...nova, funcao: e.target.value })}
                  />
                  <datalist id="funcoes-padrao">
                    {FUNCOES_PADRAO.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm">Mínimo de pessoas</span>
                  <input
                    className="campo"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={nova.minimo}
                    onChange={(e) => setNova({ ...nova, minimo: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="botao-secundario" onClick={() => setNova(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="botao" disabled={gravando || !nova.funcao.trim()}>
                    Adicionar
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="botao w-full"
                onClick={() =>
                  setNova({ dia: "", turnoId: turnosOrdenados[0].id, funcao: FUNCOES_PADRAO[0], minimo: 1 })
                }
              >
                + Adicionar regra de mínimo
              </button>
            )}
          </section>

          <section className="cartao space-y-3">
            <h2 className="text-xl font-bold">Folgas por semana</h2>
            <p className="text-sm text-neutral-600">
              Folga é um dia sem nenhum turno. Avisa quando um funcionário ativo tem menos folgas que isso.
              Use 0 para desligar.
            </p>
            <div className="flex gap-2">
              <input
                className="campo"
                type="number"
                inputMode="numeric"
                min={0}
                max={7}
                value={folgasTexto}
                onChange={(e) => setFolgasTexto(e.target.value)}
              />
              <button
                className="botao shrink-0"
                disabled={gravando || folgasTexto === String(config.folgasMinimas)}
                onClick={salvarFolgas}
              >
                Salvar
              </button>
            </div>
          </section>

          <section className="cartao space-y-3">
            <h2 className="text-xl font-bold">Fechar e abrir no dia seguinte</h2>
            <p className="text-sm text-neutral-600">
              Avisa quando alguém trabalha no último turno ({fechamento?.nome}) e no primeiro turno do
              dia seguinte ({abertura?.nome}).
            </p>
            <button
              className={`${config.verificarFecharAbrir ? "botao" : "botao-secundario"} w-full`}
              disabled={gravando}
              onClick={() =>
                salvarConfiguracao(CHAVE_FECHAR_ABRIR, config.verificarFecharAbrir ? "false" : "true")
              }
            >
              {config.verificarFecharAbrir ? "✅ Ligado · toque para desligar" : "Desligado · toque para ligar"}
            </button>
          </section>
        </>
      )}

      {!carregando && !erro && turnos.length === 0 && (
        <p className="cartao text-neutral-600">Nenhum turno cadastrado no banco.</p>
      )}
    </div>
  );
}
