// Visão Resumo da Biblioteca — todos os processos com as demandas ativas
// (Título · Responsável · Recorrência · Tipo), expansíveis com rolagem.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemandas } from '../../data/demandas.queries';
import {
  type Demanda, RECORRENCIA_DEMANDA, STATUS_DEMANDA, TIPO_DEMANDA, demandaAtrasada,
} from '../../domain/demandas';
import { STATUS_PROCESSO } from '../../domain/regras';
import type { Processo } from '../../domain/tipos';
import { Badge, EstadoVazio } from '../../components/ui';

export function ResumoProcessos(props: { processos: Processo[] }) {
  const nav = useNavigate();
  const { data: demandas } = useDemandas();
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const ativas = useMemo(() => (demandas ?? []).filter((d) =>
    !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status)), [demandas]);

  if (props.processos.length === 0) {
    return <EstadoVazio titulo="Nenhum processo com esses filtros." />;
  }

  const alternar = (id: string) => setAbertos((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  return (
    <div className="grade">
      {props.processos.map((p) => {
        const doProc = ativas.filter((d) => d.processo_id === p.id);
        const atrasadas = doProc.filter(demandaAtrasada).length;
        const aberto = abertos.has(p.id);
        return (
          <div key={p.id} className="cartao">
            <div className="linha" style={{ cursor: 'pointer', flexWrap: 'wrap' }}
                 onClick={() => alternar(p.id)} role="button" tabIndex={0} aria-expanded={aberto}>
              <strong>{p.nome}</strong>
              <Badge tom={STATUS_PROCESSO[p.status].tom}>{STATUS_PROCESSO[p.status].rotulo}</Badge>
              <Badge tom={doProc.length === 0 ? 'neutro' : 'info'}>{doProc.length} demanda(s) ativa(s)</Badge>
              {atrasadas > 0 && <Badge tom="critico">{atrasadas} atrasada(s)</Badge>}
              <div className="espaco" />
              <button className="btn mini" onClick={(e) => { e.stopPropagation(); nav(`/processos/${p.id}`); }}>
                Abrir ficha
              </button>
              <span className="mudo">{aberto ? '▴' : '▾'}</span>
            </div>

            {aberto && (
              doProc.length === 0 ? (
                <p className="mudo" style={{ marginTop: 8 }}>Nenhuma demanda ativa — gere a ocorrência na ficha.</p>
              ) : (
                <div className="scroll-box" style={{ marginTop: 10 }}>
                  <div className="linha mudo" style={{ fontWeight: 600, padding: '0 0 6px' }}>
                    <span style={{ flex: 2 }}>Título da demanda</span>
                    <span style={{ flex: 1 }}>Responsável</span>
                    <span style={{ width: 110 }}>Recorrência</span>
                    <span style={{ width: 100 }}>Tipo</span>
                  </div>
                  <ul className="lista-limpa">
                    {doProc.map((d: Demanda) => (
                      <li key={d.id} className="linha"
                          style={{ padding: '6px 0', borderTop: '1px solid var(--borda)', cursor: 'pointer' }}
                          onClick={() => nav(`/demandas/equipe/${d.id}`)}>
                        <span style={{ flex: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                          {d.titulo}
                          <Badge tom={demandaAtrasada(d) ? 'critico' : STATUS_DEMANDA[d.status].tom}>
                            {demandaAtrasada(d) ? 'Atrasada' : STATUS_DEMANDA[d.status].rotulo}
                          </Badge>
                        </span>
                        <span style={{ flex: 1 }} className="suave">{d.responsavel?.nome ?? '—'}</span>
                        <span style={{ width: 110 }} className="suave">
                          {d.recorrencia ? `↻ ${RECORRENCIA_DEMANDA[d.recorrencia]}` : '—'}
                        </span>
                        <span style={{ width: 100 }} className="suave">{TIPO_DEMANDA[d.tipo]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
