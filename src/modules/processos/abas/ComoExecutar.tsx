import { useState } from 'react';
import type { Processo, TipoArtefato } from '../../../domain/tipos';
import { TIPO_ARTEFATO } from '../../../domain/regras';
import { useArtefatos, useArtefatoMutations } from '../../../data/queries';
import { Carregando, EstadoVazio } from '../../../components/ui';

// Aba "Como Executar" (nomenclatura v1.1) — o antigo Playbook.
// Artefatos tipados e genéricos (ADR-25): o modelo aceita qualquer vertical.
export function AbaComoExecutar(props: { processo: Processo }) {
  const { processo: p } = props;
  const { data: artefatos, isLoading } = useArtefatos(p.id);
  const { criar, remover } = useArtefatoMutations(p.id);

  const [novoTipo, setNovoTipo] = useState<TipoArtefato>('fluxo_etapa');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoConteudo, setNovoConteudo] = useState('');

  const somenteLeitura = ['obsoleto', 'arquivado'].includes(p.status);

  if (isLoading) return <Carregando linhas={4} />;

  const grupos = new Map<string, NonNullable<typeof artefatos>>();
  for (const a of artefatos ?? []) {
    const g = TIPO_ARTEFATO[a.tipo].grupo;
    grupos.set(g, [...(grupos.get(g) ?? []), a]);
  }

  function adicionar() {
    if (!novoTitulo.trim()) return;
    const doTipo = (artefatos ?? []).filter((a) => a.tipo === novoTipo);
    criar.mutate({
      processo_id: p.id,
      tipo: novoTipo,
      ordem: doTipo.length + 1,
      titulo: novoTitulo.trim(),
      conteudo: novoConteudo.trim() || null,
      storage_path: null,
    });
    setNovoTitulo('');
    setNovoConteudo('');
  }

  return (
    <div>
      {(artefatos ?? []).length === 0 ? (
        <EstadoVazio titulo="Este processo ainda não tem método.">
          Adicione o fluxo, o checklist e os materiais — é o que torna o processo executável sem depender do "expert" (RN-01).
        </EstadoVazio>
      ) : (
        Array.from(grupos.entries()).map(([grupo, itens]) => (
          <div className="secao" key={grupo}>
            <h3>{grupo}</h3>
            <ul className="lista-limpa grade">
              {itens.map((a) => (
                <li key={a.id} className="cartao" style={{ padding: '10px 14px' }}>
                  <div className="linha">
                    <div>
                      <strong>{a.titulo}</strong>
                      {a.conteudo && (
                        <p className={a.tipo === 'sql' ? 'mono suave' : 'suave'} style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
                          {a.conteudo}
                        </p>
                      )}
                    </div>
                    <div className="espaco" />
                    {!somenteLeitura && (
                      <button className="btn mini" onClick={() => remover.mutate(a.id)} aria-label={`Remover ${a.titulo}`}>
                        Remover
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {!somenteLeitura && (
        <div className="cartao" style={{ marginTop: 8 }}>
          <h3 style={{ marginBottom: 10 }}>Adicionar item ao método</h3>
          <div className="grade" style={{ gridTemplateColumns: '200px 1fr' }}>
            <label className="campo">
              <span>Tipo</span>
              <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as TipoArtefato)}>
                {Object.entries(TIPO_ARTEFATO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Título</span>
              <input type="text" value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)}
                     placeholder="Ex.: Conciliar contas bancárias" />
            </label>
          </div>
          <label className="campo">
            <span>Conteúdo (opcional — descrição, link, SQL…)</span>
            <textarea value={novoConteudo} onChange={(e) => setNovoConteudo(e.target.value)} />
          </label>
          <div className="linha">
            <div className="espaco" />
            <button className="btn primario" disabled={!novoTitulo.trim() || criar.isPending} onClick={adicionar}>
              Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
