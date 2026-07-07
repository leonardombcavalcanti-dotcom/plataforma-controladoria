// Aba Operação — demandas-modelo com TODOS os campos da demanda (RN-03 completa):
// o que se configura aqui nasce pronto na tela de Demandas quando a ocorrência gera.
import { useState } from 'react';
import type { Processo } from '../../../domain/tipos';
import { usePessoas, useRecorrencia, useRecorrenciaMutations } from '../../../data/queries';
import {
  COMPLEXIDADE, PRIORIDADE, RECORRENCIA_DEMANDA, TIPO_DEMANDA, VALOR,
  type ComplexidadeDemanda, type PrioridadeDemanda, type TipoDemanda, type ValorDemanda,
} from '../../../domain/demandas';
import { Badge, Carregando, EstadoVazio } from '../../../components/ui';

export function AbaOperacao(props: { processo: Processo }) {
  const { processo: p } = props;
  const { data: itens, isLoading } = useRecorrencia(p.id);
  const { data: pessoas } = usePessoas();
  const { criar, remover } = useRecorrenciaMutations(p.id);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [prazoData, setPrazoData] = useState('');
  const [recorrenciaSel, setRecorrenciaSel] = useState('');
  const [tipo, setTipo] = useState<TipoDemanda>('rotina');
  const [prioridade, setPrioridade] = useState<PrioridadeDemanda>('media');
  const [valor, setValor] = useState<ValorDemanda>('medio');
  const [complexidade, setComplexidade] = useState<ComplexidadeDemanda | ''>('');
  const [peso, setPeso] = useState('');
  const [estimadoH, setEstimadoH] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [exigeValidacao, setExigeValidacao] = useState(false);
  const [maisDetalhes, setMaisDetalhes] = useState(false);

  const somenteLeitura = ['obsoleto', 'arquivado'].includes(p.status);
  const nomeDe = (id: string | null) => (pessoas ?? []).find((pe) => pe.id === id)?.nome ?? '—';

  if (isLoading) return <Carregando linhas={3} />;

  function adicionar() {
    if (!titulo.trim()) return;
    criar.mutate({
      processo_id: p.id,
      titulo_modelo: titulo.trim(),
      descricao: descricao.trim() || null,
      responsavel_padrao_id: responsavel || null,
      dia_util_gatilho: null,
      prazo_dias: 2,
      prazo: prazoData || null,
      recorrencia: (recorrenciaSel || null) as never,
      tipo, prioridade, valor,
      complexidade: complexidade || null,
      peso: peso ? Number(peso) : null,
      tempo_estimado_h: estimadoH ? Number(estimadoH) : null,
      objetivo_negocio: objetivo.trim() || null,
      exige_validacao: exigeValidacao,
      ordem: (itens?.length ?? 0) + 1,
    });
    setTitulo(''); setDescricao(''); setPeso(''); setEstimadoH(''); setPrazoData('');
  }

  return (
    <div>
      <div className="secao">
        <h3>Demandas recorrentes que este processo gera</h3>
        {p.periodicidade === 'sob_demanda' ? (
          <p className="suave">Processo sob demanda — sem recorrência. As ocorrências são iniciadas manualmente pelo dono.</p>
        ) : (itens ?? []).length === 0 ? (
          <EstadoVazio titulo="Nenhuma demanda recorrente configurada.">
            Processo recorrente precisa de pelo menos uma demanda-modelo para ser ativado (RN-01).
          </EstadoVazio>
        ) : (
          <ul className="lista-limpa grade">
            {(itens ?? []).map((r) => (
              <li key={r.id} className="cartao" style={{ padding: '10px 14px' }}>
                <div className="linha" style={{ flexWrap: 'wrap' }}>
                  <strong>{r.titulo_modelo}</strong>
                  <Badge tom="neutro">{TIPO_DEMANDA[r.tipo]}</Badge>
                  {r.prioridade !== 'media' && <Badge tom={PRIORIDADE[r.prioridade].tom}>{PRIORIDADE[r.prioridade].rotulo}</Badge>}
                  {r.peso !== null && <Badge tom="info">Peso {r.peso}</Badge>}
                  {r.recorrencia && <Badge tom="info">↻ {RECORRENCIA_DEMANDA[r.recorrencia]}</Badge>}
                  {r.exige_validacao && <Badge tom="atencao">Validação</Badge>}
                  <div className="espaco" />
                  {!somenteLeitura && (
                    <button className="btn mini" onClick={() => remover.mutate(r.id)}>Remover</button>
                  )}
                </div>
                <p className="mudo" style={{ marginTop: 4 }}>
                  {nomeDe(r.responsavel_padrao_id)}
                  {r.prazo ? ` · prazo-base ${r.prazo.split('-').reverse().join('/')}` : ` · D+${r.dia_util_gatilho ?? '—'} útil · ${r.prazo_dias} dia(s)`}
                  {' '}· Valor {VALOR[r.valor]}
                  {r.complexidade ? ` · ${COMPLEXIDADE[r.complexidade]}` : ''}
                  {r.tempo_estimado_h ? ` · ${r.tempo_estimado_h}h estimadas` : ''}
                </p>
                {r.descricao && <p className="suave" style={{ marginTop: 4 }}>{r.descricao}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!somenteLeitura && p.periodicidade !== 'sob_demanda' && (
        <div className="cartao">
          <h3 style={{ marginBottom: 10 }}>Adicionar demanda recorrente</h3>
          <label className="campo">
            <span>Título-modelo *</span>
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)}
                   placeholder="Ex.: Conciliação bancária consolidada" />
          </label>
          <div className="grade" style={{ gridTemplateColumns: '1fr 160px 1fr 100px' }}>
            <label className="campo">
              <span>Responsável padrão</span>
              <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                <option value="">— (cai para o dono — RN-04)</option>
                {(pessoas ?? []).map((pe) => <option key={pe.id} value={pe.id}>{pe.nome}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Prazo *</span>
              <input type="date" value={prazoData} onChange={(e) => setPrazoData(e.target.value)} />
            </label>
            <label className="campo">
              <span>Recorrência</span>
              <select value={recorrenciaSel} onChange={(e) => setRecorrenciaSel(e.target.value)}>
                <option value="">Não se repete</option>
                <option value="diaria">Diária (seg–sex)</option>
                <option value="semanal">Semanal (mesmo dia da semana)</option>
                <option value="mensal">Mensal (mesmo dia do mês)</option>
                <option value="anual">Anual</option>
              </select>
            </label>
            <label className="campo">
              <span>Peso (1–10)</span>
              <input type="number" min={1} max={10} value={peso} onChange={(e) => setPeso(e.target.value)} />
            </label>
          </div>

          {!maisDetalhes ? (
            <button className="btn mini" onClick={() => setMaisDetalhes(true)}>▸ Todos os campos da demanda</button>
          ) : (
            <>
              <div className="grade" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                <label className="campo">
                  <span>Tipo</span>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDemanda)}>
                    {Object.entries(TIPO_DEMANDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="campo">
                  <span>Prioridade</span>
                  <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeDemanda)}>
                    {Object.entries(PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                  </select>
                </label>
                <label className="campo">
                  <span>Valor (impacto)</span>
                  <select value={valor} onChange={(e) => setValor(e.target.value as ValorDemanda)}>
                    {Object.entries(VALOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="campo">
                  <span>Complexidade</span>
                  <select value={complexidade} onChange={(e) => setComplexidade(e.target.value as ComplexidadeDemanda | '')}>
                    <option value="">—</option>
                    {Object.entries(COMPLEXIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
              <div className="grade" style={{ gridTemplateColumns: '160px 1fr' }}>
                <label className="campo">
                  <span>Tempo estimado (h)</span>
                  <input type="number" min={0.5} step={0.5} value={estimadoH}
                         onChange={(e) => setEstimadoH(e.target.value)} />
                </label>
                <label className="campo">
                  <span>Objetivo de negócio (padrão: nome do processo)</span>
                  <input type="text" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                         placeholder={p.nome} />
                </label>
              </div>
              <label className="campo">
                <span>Descrição</span>
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </label>
            </>
          )}

          <label className="linha" style={{ marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={exigeValidacao} onChange={(e) => setExigeValidacao(e.target.checked)}
                   style={{ width: 'auto' }} />
            <span>Exige validação ao concluir</span>
          </label>
          <div className="linha">
            <div className="espaco" />
            <button className="btn primario" disabled={!titulo.trim() || !prazoData || criar.isPending} onClick={adicionar}>
              Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
