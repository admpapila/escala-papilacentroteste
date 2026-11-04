"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario } from "@/lib/tipos";

const OUTRA = "__outra__";

type Formulario = {
  id: string | null; // null = funcionário novo
  nome: string;
  funcao: string;
  funcaoOutra: string;
  telefone: string;
};

const formularioVazio: Formulario = {
  id: null,
  nome: "",
  funcao: FUNCOES_PADRAO[0],
  funcaoOutra: "",
  telefone: "",
};

export default function Equipe() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(variaveisConfiguradas());
  const [erro, setErro] = useState<string | null>(() =>
    variaveisConfiguradas()
      ? null
      : "As variáveis do Supabase não foram configuradas. Veja a página Início.",
  );
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase()
      .from("funcionarios")
      .select("id, nome, funcao, telefone, cpf, ativo")
      .order("nome");
    if (error) setErro(`Não foi possível carregar a equipe. Detalhe: ${error.message}`);
    else setFuncionarios((data ?? []) as Funcionario[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca dados no banco ao abrir a tela
    if (variaveisConfiguradas()) carregar();
  }, [carregar]);

  // Funções que aparecem na lista: as padrão + as que já existem no banco.
  const funcoes = useMemo(() => {
    const todas = new Set(FUNCOES_PADRAO);
    funcionarios.forEach((f) => todas.add(f.funcao));
    return Array.from(todas);
  }, [funcionarios]);

  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);

  function abrirNovo() {
    setFormulario({ ...formularioVazio });
  }

  function abrirEdicao(f: Funcionario) {
    setFormulario({
      id: f.id,
      nome: f.nome,
      funcao: f.funcao,
      funcaoOutra: "",
      telefone: f.telefone ?? "",
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!formulario) return;
    const nome = formulario.nome.trim();
    const funcao =
      formulario.funcao === OUTRA ? formulario.funcaoOutra.trim() : formulario.funcao;
    if (!nome || !funcao) {
      setErro("Preencha o nome e a função.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const dados = { nome, funcao, telefone: formulario.telefone.trim() || null };
    const db = supabase().from("funcionarios");
    const { error } = formulario.id
      ? await db.update(dados).eq("id", formulario.id)
      : await db.insert(dados);
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível salvar. Detalhe: ${error.message}`);
      return;
    }
    setFormulario(null);
    carregar();
  }

  async function mudarAtivo(f: Funcionario, ativo: boolean) {
    if (!ativo && !confirm(`Desativar ${f.nome}? A pessoa sai da lista da escala, mas o histórico fica guardado.`)) return;
    setErro(null);
    const { error } = await supabase().from("funcionarios").update({ ativo }).eq("id", f.id);
    if (error) setErro(`Não foi possível atualizar. Detalhe: ${error.message}`);
    else carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {!formulario && (
          <button className="botao" onClick={abrirNovo}>
            + Adicionar
          </button>
        )}
      </div>

      {erro && <p className="cartao border-red-300 text-red-700">{erro}</p>}

      {formulario && (
        <form onSubmit={salvar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">
            {formulario.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              className="campo"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
            >
              {funcoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
              <option value={OUTRA}>Outra…</option>
            </select>
          </label>
          {formulario.funcao === OUTRA && (
            <label className="block">
              <span className="mb-1 block font-medium">Qual função?</span>
              <input
                className="campo"
                value={formulario.funcaoOutra}
                onChange={(e) => setFormulario({ ...formulario, funcaoOutra: e.target.value })}
                required
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              placeholder="(11) 90000-0000"
              value={formulario.telefone}
              onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button className="botao flex-1" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              className="botao-secundario flex-1"
              type="button"
              onClick={() => setFormulario(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {carregando ? (
        <p className="text-neutral-600">Carregando...</p>
      ) : (
        <>
          {ativos.length === 0 && !erro && (
            <p className="text-neutral-600">Nenhum funcionário ativo cadastrado.</p>
          )}
          <ul className="space-y-3">
            {ativos.map((f) => (
              <li key={f.id} className="cartao">
                <CartaoFuncionario funcionario={f} />
                <div className="mt-3 flex gap-2">
                  <button className="botao-secundario flex-1" onClick={() => abrirEdicao(f)}>
                    Editar
                  </button>
                  <button className="botao-secundario flex-1" onClick={() => mudarAtivo(f, false)}>
                    Desativar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {inativos.length > 0 && (
            <section className="space-y-3 pt-4">
              <h2 className="text-lg font-semibold text-neutral-600">Desativados</h2>
              <ul className="space-y-3">
                {inativos.map((f) => (
                  <li key={f.id} className="cartao opacity-70">
                    <CartaoFuncionario funcionario={f} />
                    <button
                      className="botao-secundario mt-3 w-full"
                      onClick={() => mudarAtivo(f, true)}
                    >
                      Reativar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CartaoFuncionario({ funcionario }: { funcionario: Funcionario }) {
  return (
    <div>
      <p className="text-lg font-semibold">{funcionario.nome}</p>
      <p className="text-neutral-700">{funcionario.funcao}</p>
      {funcionario.telefone ? (
        <a href={`tel:${funcionario.telefone.replace(/\D/g, "")}`} className="text-neutral-700 underline">
          {funcionario.telefone}
        </a>
      ) : (
        <p className="text-neutral-500">Sem telefone</p>
      )}
    </div>
  );
}
