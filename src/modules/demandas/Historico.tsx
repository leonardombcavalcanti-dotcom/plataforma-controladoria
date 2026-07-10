// Histórico em "pastas" (V2): cada série de demanda é uma pasta 📁;
// dentro, as execuções que já aconteceram, com resultado, avaliação e anexos.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useDemandas } from '../../data/demandas.queries';
import {
  type Demanda, MOTIVO_CONCLUSAO, MOTIVO_ENCERRAMENTO, STATUS_DEMANDA,
} from '../../domain/demandas';
import { fmtData } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';

const tituloBase = (t: string) => t.replace(/ — \d{4}-(0[1-9]|1[0-2])$/, '');

function useContagemAnexos(ids: string[]) {
  return useQuery({
    queryKey: ['anexos-contagem', ids.slice().sort().join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('demanda_anexos').select('demanda_id').in('demanda_id', ids);
      if (error) throw new Error(error.message);
      const mapa = new Map<string, number>();
      for (const r of data ?? []) {
        mapa.set(r.demanda_id as string, (mapa.get(r.demanda_id as string) ?? 0) + 1);
      }
      return mapa;
    },
  });
}

export function HistoricoDemandas(props: { processoId?: string; somenteAvulsas?: boolean }) {
  const nav = useNavigate();
  const { data: demandas, isLoading } = useDemandas();
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const finalizadas = useMemo(() => (demandas ?? []).filter((d) => {
    if (!['concluida', 'encerrada'].includes(d.status)) return false;
    if (props.processoId && d.processo_id !== props.processoId) return false;
    if (props.somenteAvulsas && d.processo_id !== null) return false;
    return true;
  }), [demandas, props.processoId, props.somenteAvulsas]);

  const { data: contagem } = useContagemAnexos(finalizadas.map((d) => d.id));

  const pastas = useMemo(() => {
    const mapa = new Map<string, { rotulo: string; itens: Demanda[] }>();
    for (const d of finalizadas) {
      const chave = (d as unknown as { recorrencia_id?: string | null }).recorrencia_id ?? tituloBase(d.titulo);
      const atual = mapa.get(String(chave)) ?? { rotulo: tituloBase(d.titulo), itens: [] };
      atual.itens.push(d);
      mapa.set(String(chave), atual);
    }
    return [...mapa.values()]
      .map((p) => ({ ...p, itens: p.itens.sort((a, b) => (a.prazo < b.prazo ? 1 : -1)) }))
      .sort((a, b) => b.itens.length - a.itens.length || a.rotulo.localeCompare(b.rotulo));
  }, [finalizadas]);

  if (isLoading) return <Carregando linhas={4} />;
  if (pastas.length === 0) {
    return (
      <EstadoVazio titulo="Nenhuma execução finalizada ainda.">
        Quando as demandas {props.somenteAvulsas ? 'avulsas ' : ''}forem concluídas, cada série vira uma
        pasta aqui — com resultados, avaliações e anexos.
      </EstadoVazio>
    );
  }

  const alternar = (r: string) => setAbertas((s) => {
    const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n;
  });

  return (
    <div className="grade">
      {pastas.map((pasta) => {
        const aberta = abertas.has(pasta.rotulo);
        const totalAnexos = pasta.itens.reduce((s, d) => s + (contagem?.get(d.id) ?? 0), 0);
        return (
          <div key={pasta.rotulo} className="cartao">
            <div className="linha" style={{ cursor: 'pointer' }} onClick={() => alternar(pasta.rotulo)}
                 role="button" tabIndex={0} aria-expanded={aberta}>
              <span style={{ fontSize: 16 }}>{aberta ? '📂' : '📁'}</span>
              <strong>{pasta.rotulo}</strong>
              <Badge tom="info">{pasta.itens.length} execução(ões)</Badge>
              {totalAnexos > 0 && <Badge tom="neutro">📎 {totalAnexos}</Badge>}
              <div className="espaco" />
              <span className="mudo">{aberta ? '▴' : '▾'}</span>
            </div>
            {aberta && (
              <ul className="lista-limpa scroll-box" style={{ marginTop: 8 }}>
                {pasta.itens.map((d) => (
                  <li key={d.id} className="linha"
                      style={{ padding: '7px 0', borderTop: '1px solid var(--borda)', cursor: 'pointer', flexWrap: 'wrap' }}
                      onClick={() => nav(`/demandas/arquivadas/${d.id}`)}>
                    <span className="mudo" style={{ minWidth: 82 }}>{fmtData(d.prazo)}</span>
                    <span>{d.titulo}</span>
                    <Badge tom={STATUS_DEMANDA[d.status].tom}>
                      {d.motivo_conclusao ? MOTIVO_CONCLUSAO[d.motivo_conclusao]
                        : d.motivo_encerramento ? MOTIVO_ENCERRAMENTO[d.motivo_encerramento]
                        : STATUS_DEMANDA[d.status].rotulo}
                    </Badge>
                    {d.avaliacao_nota !== null && (
                      <span style={{ color: 'var(--cor-atencao)' }}>{'★'.repeat(d.avaliacao_nota)}</span>
                    )}
                    {(contagem?.get(d.id) ?? 0) > 0 && <Badge tom="neutro">📎 {contagem?.get(d.id)}</Badge>}
                    <div className="espaco" />
                    <span className="mudo">{d.responsavel?.nome ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
