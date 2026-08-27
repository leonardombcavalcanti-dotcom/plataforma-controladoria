// Visão Resumo da Biblioteca — cada processo mostra suas DEMANDAS-MODELO
// (o que ele gera) confrontadas com as demandas ativas de verdade:
// quem está executando, quando vence, e o que ainda não foi gerado.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useDemandas } from '../../data/demandas.queries';
import {
  type Demanda, RECORRENCIA_DEMANDA, STATUS_DEMANDA, TIPO_DEMANDA, demandaAtrasada, ehSubstituicao,
} from '../../domain/demandas';
import { STATUS_PROCESSO, fmtData } from '../../domain/regras';
import type { Processo, RecorrenciaItem } from '../../domain/tipos';
import { Badge, EstadoVazio } from '../../components/ui';

function useRecorrenciasTodas() {
  return useQuery({
    queryKey: ['recorrencias-todas'],
    staleTime: 60_000,
    queryFn: async (): Promise<RecorrenciaItem[]> => {
      const { data, error } = await supabase
        .from('processo_recorrencia').select('*').is('archived_at', null).order('ordem');
      if (error) return [];
      return (data ?? []) as RecorrenciaItem[];
    },
  });
}

export function ResumoProcessos(props: { processos: Processo[] }) {
  const nav = useNavigate();
  const { data: demandas } = useDemandas();
  const { data: recorrencias } = useRecorrenciasTodas();
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
        const moldes = (recorrencias ?? []).filter((r) => r.processo_id === p.id);
        const doProc = ativas.filter((d) => d.processo_id === p.id);
        const semMolde = doProc.filter((d) => !d.recorrencia_id
          || !moldes.some((m) => m.id === d.recorrencia_id));
        const atrasadas = doProc.filter(demandaAtrasada).length;
        const semGerar = moldes.filter((m) => !doProc.some((d) => d.recorrencia_id === m.id)).length;
        const aberto = abertos.has(p.id);

        return (
          <div key={p.id} className="cartao">
            <div className="linha" style={{ cursor: 'pointer', flexWrap: 'wrap' }}
                 onClick={() => alternar(p.id)} role="button" tabIndex={0} aria-expanded={aberto}>
              <strong>{p.nome}</strong>
              <Badge tom={STATUS_PROCESSO[p.status].tom}>{STATUS_PROCESSO[p.status].rotulo}</Badge>
              <Badge tom="neutro">{moldes.length} modelo(s)</Badge>
              <Badge tom={doProc.length === 0 ? 'neutro' : 'info'}>{doProc.length} ativa(s)</Badge>
              {atrasadas > 0 && <Badge tom="critico">{atrasadas} atrasada(s)</Badge>}
              {semGerar > 0 && <Badge tom="atencao">{semGerar} sem gerar</Badge>}
              <div className="espaco" />
              <button className="btn mini" onClick={(e) => { e.stopPropagation(); nav(`/processos/${p.id}`); }}>
                Abrir ficha
              </button>
              <span className="mudo">{aberto ? '▴' : '▾'}</span>
            </div>

            {aberto && (
              <div className="scroll-box" style={{ marginTop: 10 }}>
                <div className="linha mudo" style={{ fontWeight: 600, padding: '0 0 6px' }}>
                  <span style={{ flex: 2 }}>Demanda (modelo do processo)</span>
                  <span style={{ flex: 1 }}>Responsável</span>
                  <span style={{ width: 110 }}>Recorrência</span>
                  <span style={{ width: 100 }}>Tipo</span>
                  <span style={{ width: 100 }}>Situação</span>
                </div>
                <ul className="lista-limpa">
                  {moldes.map((m) => {
                    const instancias = doProc.filter((d) => d.recorrencia_id === m.id)
                      .sort((a, b) => (a.prazo < b.prazo ? -1 : 1));
                    const d: Demanda | undefined = instancias[0];
                    return (
                      <li key={m.id} className="linha"
                          style={{ padding: '6px 0', borderTop: '1px solid var(--borda)',
                                   cursor: d ? 'pointer' : 'default', opacity: d ? 1 : 0.7 }}
                          onClick={() => d && nav(`/demandas/equipe/${d.id}`)}>
                        <span style={{ flex: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                          {m.titulo_modelo}
                          {instancias.length > 1 && (
                            <Badge tom="critico">⚠ {instancias.length} duplicadas</Badge>
                          )}
                        </span>
                        <span style={{ flex: 1 }} className="suave">
                          {d ? `${ehSubstituicao(d) ? '🔄 ' : ''}${d.responsavel?.nome ?? '—'}` : '—'}
                        </span>
                        <span style={{ width: 110 }} className="suave">
                          {m.recorrencia ? `↻ ${RECORRENCIA_DEMANDA[m.recorrencia]}` : '—'}
                        </span>
                        <span style={{ width: 100 }} className="suave">{TIPO_DEMANDA[m.tipo]}</span>
                        <span style={{ width: 100 }}>
                          {d ? (
                            <Badge tom={demandaAtrasada(d) ? 'critico' : STATUS_DEMANDA[d.status].tom}>
                              {demandaAtrasada(d) ? `Atrasada · ${fmtData(d.prazo)}` : fmtData(d.prazo)}
                            </Badge>
                          ) : (
                            <span className="mudo">sem gerar</span>
                          )}
                        </span>
                      </li>
                    );
                  })}

                  {semMolde.map((d) => (
                    <li key={d.id} className="linha"
                        style={{ padding: '6px 0', borderTop: '1px solid var(--borda)', cursor: 'pointer' }}
                        onClick={() => nav(`/demandas/equipe/${d.id}`)}>
                      <span style={{ flex: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                        {d.titulo}
                        <Badge tom="neutro">extra</Badge>
                      </span>
                      <span style={{ flex: 1 }} className="suave">
                        {ehSubstituicao(d) ? '🔄 ' : ''}{d.responsavel?.nome ?? '—'}
                      </span>
                      <span style={{ width: 110 }} className="suave">
                        {d.recorrencia ? `↻ ${RECORRENCIA_DEMANDA[d.recorrencia]}` : '—'}
                      </span>
                      <span style={{ width: 100 }} className="suave">{TIPO_DEMANDA[d.tipo]}</span>
                      <span style={{ width: 100 }}>
                        <Badge tom={demandaAtrasada(d) ? 'critico' : STATUS_DEMANDA[d.status].tom}>
                          {fmtData(d.prazo)}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
                {moldes.length === 0 && semMolde.length === 0 && (
                  <p className="mudo" style={{ marginTop: 8 }}>
                    Nenhuma demanda-modelo configurada — defina a recorrência na aba Operação da ficha.
                  </p>
                )}
                {semGerar > 0 && (
                  <p className="mudo" style={{ marginTop: 8 }}>
                    {semGerar} modelo(s) ainda sem demanda ativa — gere a ocorrência na aba Ocorrências da ficha.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
