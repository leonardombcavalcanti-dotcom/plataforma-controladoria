// Status dos processos ativos — resumo expansível com o andamento demanda a demanda.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProcessos } from '../../data/queries';
import { useDemandas } from '../../data/demandas.queries';
import { type Demanda, STATUS_DEMANDA, demandaAtrasada } from '../../domain/demandas';
import { fmtData } from '../../domain/regras';
import { Badge } from '../../components/ui';

export function StatusProcessos() {
  const nav = useNavigate();
  const { data: processos } = useProcessos();
  const { data: demandas } = useDemandas();
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [painelAberto, setPainelAberto] = useState(false);  // vem sempre fechado

  const linhas = useMemo(() => {
    const ativosDemanda = (demandas ?? []).filter((d) =>
      !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status));
    return (processos ?? [])
      .filter((p) => ['ativo', 'em_revisao'].includes(p.status))
      .map((p) => {
        const doProc = ativosDemanda.filter((d) => d.processo_id === p.id);
        return {
          p,
          ativas: doProc,
          atrasadas: doProc.filter(demandaAtrasada).length,
          bloqueadas: doProc.filter((d) => d.status === 'bloqueada').length,
        };
      })
      .sort((a, b) => (b.atrasadas + b.bloqueadas) - (a.atrasadas + a.bloqueadas) || b.ativas.length - a.ativas.length);
  }, [processos, demandas]);

  if (linhas.length === 0) return null;

  const alternar = (id: string) => setAbertos((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const totalAtrasadas = linhas.reduce((s, l) => s + l.atrasadas, 0);
  const totalBloqueadas = linhas.reduce((s, l) => s + l.bloqueadas, 0);

  return (
    <div className="cartao secao" style={{ borderLeft: '3px solid var(--cor-primaria)' }}>
      <div className="linha" style={{ cursor: 'pointer' }} onClick={() => setPainelAberto(!painelAberto)}
           role="button" tabIndex={0} aria-expanded={painelAberto}>
        <h3 style={{ margin: 0 }}>Processos ativos — status</h3>
        <Badge tom="info">{linhas.length}</Badge>
        {totalAtrasadas > 0 && <Badge tom="critico">{totalAtrasadas} atrasada(s)</Badge>}
        {totalBloqueadas > 0 && <Badge tom="atencao">{totalBloqueadas} bloqueada(s)</Badge>}
        <div className="espaco" />
        <span className="mudo">{painelAberto ? 'ocultar ▴' : 'mostrar ▾'}</span>
      </div>
      {painelAberto && (
      <div className="grade scroll-box" style={{ marginTop: 12, maxHeight: 380 }}>
        {linhas.map(({ p, ativas, atrasadas, bloqueadas }) => {
          const aberto = abertos.has(p.id);
          const saudavel = atrasadas === 0 && bloqueadas === 0;
          return (
            <div key={p.id} style={{ borderBottom: '1px solid var(--borda)', paddingBottom: 8 }}>
              <div className="linha" style={{ cursor: 'pointer' }} onClick={() => alternar(p.id)}
                   role="button" tabIndex={0} aria-expanded={aberto}>
                <span style={{ fontSize: 13 }}>{saudavel ? '🟢' : atrasadas > 0 ? '🔴' : '🟠'}</span>
                <strong>{p.nome}</strong>
                <Badge tom={ativas.length === 0 ? 'neutro' : 'info'}>{ativas.length} ativa(s)</Badge>
                {atrasadas > 0 && <Badge tom="critico">{atrasadas} atrasada(s)</Badge>}
                {bloqueadas > 0 && <Badge tom="atencao">{bloqueadas} bloqueada(s)</Badge>}
                <div className="espaco" />
                <button className="btn mini" onClick={(e) => { e.stopPropagation(); nav(`/processos/${p.id}`); }}>
                  Ficha
                </button>
                <span className="mudo">{aberto ? '▴' : '▾'}</span>
              </div>
              {aberto && ativas.length > 0 && (
                <ul className="lista-limpa scroll-box" style={{ marginTop: 6 }}>
                  {ativas.map((d: Demanda) => (
                    <li key={d.id} className="linha"
                        style={{ padding: '5px 0', borderBottom: '1px solid var(--borda)', cursor: 'pointer' }}
                        onClick={() => nav(`/demandas/equipe/${d.id}`)}>
                      <span>{d.titulo}</span>
                      <Badge tom={demandaAtrasada(d) ? 'critico' : STATUS_DEMANDA[d.status].tom}>
                        {demandaAtrasada(d) ? 'Atrasada' : STATUS_DEMANDA[d.status].rotulo}
                      </Badge>
                      <div className="espaco" />
                      <span className="mudo">{d.responsavel?.nome ?? '—'} · {fmtData(d.prazo)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {aberto && ativas.length === 0 && (
                <p className="mudo" style={{ marginTop: 6 }}>Nenhuma demanda ativa deste processo.</p>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
