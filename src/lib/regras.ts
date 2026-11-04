// Regras da casa: verificação da escala da semana.
// Este arquivo não acessa o banco nem a tela: recebe os dados e devolve os alertas.
// Os valores das regras ficam no banco (tabelas `regras` e `configuracoes`)
// e são editados na tela "Regras da casa" (/regras).

import type { Configuracao, Escala, Funcionario, Regra, Turno } from "./tipos";
import { paraData, somarDias } from "./datas";

// Chaves usadas na tabela `configuracoes`.
export const CHAVE_FOLGAS = "folgas_minimas_semana";
export const CHAVE_FECHAR_ABRIR = "bloquear_fechar_e_abrir";

// Valores usados se a configuração não existir no banco.
export const PADRAO_FOLGAS = 1;
export const PADRAO_FECHAR_ABRIR = true;

export type ConfigRegras = {
  minimos: Regra[];
  folgasMinimas: number;
  verificarFecharAbrir: boolean;
};

export type Alerta = {
  tipo: "minimo" | "folga" | "fechar_abrir";
  texto: string;
  data?: string; // alertas de célula
  turnoId?: string; // alertas de célula
  funcionarioId?: string;
};

/** Lê as configurações do banco no formato das regras. */
export function lerConfiguracoes(regras: Regra[], configuracoes: Configuracao[]): ConfigRegras {
  const valor = (chave: string) => configuracoes.find((c) => c.chave === chave)?.valor;
  const folgas = Number(valor(CHAVE_FOLGAS));
  const fecharAbrir = valor(CHAVE_FECHAR_ABRIR);
  return {
    minimos: regras,
    folgasMinimas: Number.isFinite(folgas) ? folgas : PADRAO_FOLGAS,
    verificarFecharAbrir: fecharAbrir === undefined ? PADRAO_FECHAR_ABRIR : fecharAbrir === "true",
  };
}

/**
 * Mínimo de cada função para um dia e turno.
 * Regra de um dia específico vale no lugar da regra de "todos os dias".
 */
export function minimosDoTurno(regras: Regra[], data: string, turnoId: string): Map<string, number> {
  const diaSemana = paraData(data).getDay();
  const doTurno = regras.filter((r) => r.turno_id === turnoId);
  const geral = new Map<string, number>();
  const doDia = new Map<string, number>();
  for (const r of doTurno) {
    if (r.dia_semana === null) geral.set(r.funcao, Math.max(geral.get(r.funcao) ?? 0, r.minimo));
    else if (r.dia_semana === diaSemana)
      doDia.set(r.funcao, Math.max(doDia.get(r.funcao) ?? 0, r.minimo));
  }
  return new Map([...geral, ...doDia]);
}

function primeiroNome(f: Funcionario | undefined): string {
  return f?.nome.split(" ")[0] ?? "?";
}

/**
 * Verifica a semana e devolve todos os alertas.
 * `escalas` pode incluir o dia anterior à semana (para a regra de fechar e abrir).
 */
export function verificarSemana(params: {
  dias: string[];
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalas: Escala[];
  config: ConfigRegras;
}): Alerta[] {
  const { dias, turnos, funcionarios, escalas, config } = params;
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const alertas: Alerta[] = [];

  const escalados = (data: string, turnoId: string) =>
    escalas.filter((e) => e.data === data && e.turno_id === turnoId).map((e) => e.funcionario_id);

  // 1. Mínimo de pessoas por turno e função.
  for (const d of dias) {
    for (const t of turnos) {
      const ids = escalados(d, t.id);
      for (const [funcao, minimo] of minimosDoTurno(config.minimos, d, t.id)) {
        const tem = ids.filter((id) => porId.get(id)?.funcao === funcao).length;
        if (tem < minimo) {
          alertas.push({
            tipo: "minimo",
            data: d,
            turnoId: t.id,
            texto: `Falta ${minimo - tem} no ${funcao}`,
          });
        }
      }
    }
  }

  // 2. Folgas mínimas por semana (folga = dia sem nenhum turno).
  if (config.folgasMinimas > 0) {
    const semana = new Set(dias);
    for (const f of funcionarios.filter((f) => f.ativo)) {
      const diasTrabalhados = new Set(
        escalas.filter((e) => e.funcionario_id === f.id && semana.has(e.data)).map((e) => e.data),
      );
      const folgas = dias.length - diasTrabalhados.size;
      if (folgas < config.folgasMinimas) {
        alertas.push({
          tipo: "folga",
          funcionarioId: f.id,
          texto:
            folgas === 0
              ? `${f.nome}: sem folga na semana`
              : `${f.nome}: só ${folgas} folga(s), mínimo ${config.folgasMinimas}`,
        });
      }
    }
  }

  // 3. Quem fecha (último turno) não abre o dia seguinte (primeiro turno).
  if (config.verificarFecharAbrir && turnos.length >= 2) {
    const ordenados = [...turnos].sort((a, b) => a.ordem - b.ordem);
    const abertura = ordenados[0];
    const fechamento = ordenados[ordenados.length - 1];
    for (const d of dias) {
      const fecharamOntem = new Set(escalados(somarDias(d, -1), fechamento.id));
      for (const id of escalados(d, abertura.id)) {
        if (fecharamOntem.has(id)) {
          alertas.push({
            tipo: "fechar_abrir",
            data: d,
            turnoId: abertura.id,
            funcionarioId: id,
            texto: `${primeiroNome(porId.get(id))} fechou ontem`,
          });
        }
      }
    }
  }

  return alertas;
}
