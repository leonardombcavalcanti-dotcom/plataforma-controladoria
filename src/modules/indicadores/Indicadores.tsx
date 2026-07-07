// Módulo Indicadores (📊 — o 8º do menu congelado, previsto para a F2).
// Vistas: Operação (séries e causas) · Processos (matriz Maturidade × Conformidade).
// Fonte única: as mesmas funções do banco que alimentam cockpit e fichas.
import { useMemo } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useDemandas } from '../../data/demandas.queries';
import { useProcessos } from '../../data/queries';
import { useBloqueiosAtivos } from '../../data/central.api';
import { useIndicadoresProcesso, useSaude, semaforo } from '../../data/indicadores.api';
import { CAUSA_BLOQUEIO, type CausaBloqueio, demandaAtrasada } from '../../domain/demandas';
import { fmtCompetencia } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import type { Processo } from '../../domain/tipos';
import { Desempenho } from './Desempenho';

type Vista = 'operacao' | 'desempenho' | 'processos';

export function Indicadores() {
  const { vista = 'operacao' } = useParams<{ vista: Vista }>();
  return (
    <>
      <div className="linha" style={{ marginBottom: 14 }}>
        <h1>Indicadores</h1>
      </div>
      <nav className="abas" style={{ marginBottom: 16, marginTop: 0 }} aria-label="Vistas">
        {([['operacao', 'Operação'], ['desempenho', 'Desempenho'], ['processos', 'Processos']] as [Vista, string][]).map(([k, r]) => (
          <NavLink key={k} to={`/indicadores/${k}`}
            className={({ isActive }) => `aba ${isActive ? 'ativa' : ''}`}>{r}</NavLink>
        ))}
      </nav>
      {vista === 'operacao' ? <VistaOperacao /> : vista === 'desempenho' ? <Desempenho /> : <VistaProcessos />}
    </>
  );
}

// ---------- OPERAÇÃO ----------
function VistaOperacao() {
  const nav = useNavigate();
  const { data: saude } = useSaude();
  const { data: demandas, isLoading } = useDemandas();
  const { data: bloqueios } = useBloqueiosAtivos();

  // Série dos últimos 6 meses (conclusões)
  const serie = useMemo(() => {
    const meses: { chave: string; concluidas: number; noPrazo: number }[] = [];
    const agora = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      meses.push({
        chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        concluidas: 0, noPrazo: 0,
      });
    }
    for (const d of demandas ?? []) {
      if (d.status !== 'concluida' || !d.concluida_em) continue;
      const chave = d.concluida_em.slice(0, 7);
      const m = meses.find((x) => x.chave === chave);
      if (m) {
        m.concluidas++;
        if (d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada') m.noPrazo++;
      }
    }
    return meses;
  }, [demandas]);

  const causas = useMemo(() => {
    const mapa = new Map<CausaBloqueio, number>();
    for (const b of bloqueios ?? []) mapa.set(b.causa, (mapa.get(b.causa) ?? 0) + 1);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [bloqueios]);

  const ativas = useMemo(() =>
    (demandas ?? []).filter((d) => !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status)),
    [demandas]);

  if (isLoading) return <Carregando linhas={5} />;

  const maxSerie = Math.max(1, ...serie.map((m) => m.concluidas));

  return (
    <div style={{ maxWidth: 860 }}>
      {saude && (
        <div className="grade secao" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          <CardNumero rotulo="Saúde Operacional" valor={`${semaforo(saude.score).emoji} ${saude.score}%`} />
          <CardNumero rotulo="Demandas ativas" valor={String(ativas.length)} />
          <CardNumero rotulo="Atrasadas agora" valor={String(ativas.filter(demandaAtrasada).length)}
                      critico={ativas.some(demandaAtrasada)} />
          <CardNumero rotulo="Bloqueios ativos" valor={String((bloqueios ?? []).length)}
                      critico={(bloqueios ?? []).length > 0} />
        </div>
      )}

      <div className="cartao secao">
        <h3 style={{ marginBottom: 12 }}>Conclusões por mês (últimos 6 meses)</h3>
        <div className="grade">
          {serie.map((m) => (
            <div key={m.chave} className="linha">
              <span style={{ minWidth: 110 }}>{fmtCompetencia(m.chave)}</span>
              <div className="barra-h" style={{ flex: 1 }}>
                <div style={{ width: `${(m.concluidas / maxSerie) * 100}%` }} />
              </div>
              <span className="mudo" style={{ minWidth: 170, textAlign: 'right' }}>
                {m.concluidas} concluída(s){m.concluidas > 0 ? ` · ${Math.round((m.noPrazo / m.concluidas) * 100)}% no prazo` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="cartao secao">
        <h3 style={{ marginBottom: 12 }}>Maior causa de bloqueio (ativos agora)</h3>
        {causas.length === 0 ? (
          <p className="suave">Nenhum bloqueio ativo — operação fluindo.</p>
        ) : (
          <div className="grade">
            {causas.map(([causa, n]) => (
              <div key={causa} className="linha" style={{ cursor: 'pointer' }}
                   onClick={() => nav('/demandas/equipe')}>
                <span style={{ minWidth: 190 }}>{CAUSA_BLOQUEIO[causa]}</span>
                <div className="barra-h" style={{ flex: 1 }}>
                  <div style={{ width: `${(n / causas[0][1]) * 100}%`, background: 'var(--cor-critico)' }} />
                </div>
                <span className="mudo" style={{ minWidth: 30, textAlign: 'right' }}>{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mudo">
        Consolidado da operação — nunca ranking de pessoas (Art. 42.10). Séries individuais: só cada um vê as suas (F2).
      </p>
    </div>
  );
}

function CardNumero(props: { rotulo: string; valor: string; critico?: boolean }) {
  return (
    <div className="cartao" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700,
                    color: props.critico ? 'var(--cor-critico)' : 'var(--texto)' }}>
        {props.valor}
      </div>
      <div className="mudo">{props.rotulo}</div>
    </div>
  );
}

// ---------- PROCESSOS: matriz Maturidade × Conformidade ----------
function VistaProcessos() {
  const { data: processos, isLoading } = useProcessos();
  const ativos = (processos ?? []).filter((p) => ['ativo', 'em_revisao'].includes(p.status));

  if (isLoading) return <Carregando linhas={4} />;
  if (ativos.length === 0) {
    return <EstadoVazio titulo="Nenhum processo ativo.">Ative processos na Biblioteca para medi-los aqui.</EstadoVazio>;
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="grade">
        {ativos.map((p) => <LinhaProcesso key={p.id} p={p} />)}
      </div>
      <p className="mudo" style={{ marginTop: 10 }}>
        Maturidade = bem definido · Conformidade = bem executado (RN-10). O detalhe completo está na aba
        Indicadores de cada processo.
      </p>
    </div>
  );
}

function LinhaProcesso(props: { p: Processo }) {
  const nav = useNavigate();
  const { data: ind } = useIndicadoresProcesso(props.p.id);
  const mat = ind?.maturidade?.score ?? null;
  const conf = ind?.conformidade?.score ?? null;

  const leitura = mat !== null && conf !== null
    ? (mat >= 70 && conf >= 85 ? { t: 'Exemplar', tom: 'saudavel' as const }
      : mat >= 70 ? { t: 'Definido, mal executado', tom: 'atencao' as const }
      : conf >= 85 ? { t: 'Roda no heroísmo', tom: 'atencao' as const }
      : { t: 'Risco crítico', tom: 'critico' as const })
    : null;

  return (
    <div className="cartao clicavel" onClick={() => nav(`/processos/${props.p.id}`)} role="button" tabIndex={0}>
      <div className="linha" style={{ flexWrap: 'wrap' }}>
        <strong>{props.p.nome}</strong>
        {leitura && <Badge tom={leitura.tom}>{leitura.t}</Badge>}
        <div className="espaco" />
        <span className="suave">Maturidade: <strong>{mat !== null ? `${mat}%` : '—'}</strong></span>
        <span className="suave">· Conformidade: <strong>{conf !== null ? `${semaforo(conf).emoji} ${conf}%` : 'sem execuções'}</strong></span>
        {ind?.tempo_medio_dias != null && (
          <span className="mudo">· {ind.tempo_medio_dias} dia(s)/ocorrência</span>
        )}
      </div>
    </div>
  );
}
