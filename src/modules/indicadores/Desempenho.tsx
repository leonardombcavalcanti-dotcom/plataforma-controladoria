// Dashboard de Desempenho — página única, tudo interligado:
// clique em processo/tipo/mês e o painel inteiro se recorta (cross-filter);
// tabela analítica embaixo com resumo da demanda em drawer, sem sair da tela.
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useDemandas } from '../../data/demandas.queries';
import { useAreas, usePessoaAtual, usePessoas, useProcessos } from '../../data/queries';
import {
  type Demanda, MOTIVO_CONCLUSAO, PRIORIDADE, RECORRENCIA_DEMANDA,
  STATUS_DEMANDA, TIPO_DEMANDA, type TipoDemanda, VALOR, demandaAtrasada,
} from '../../domain/demandas';
import { fmtCompetencia, fmtData } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import { MultiFiltro } from '../../components/MultiFiltro';
import { useAnexos } from '../demandas/Anexos';

type Periodo = '30' | '90' | '365' | 'este_mes' | 'mes_passado' | 'este_ano' | 'tudo' | 'custom';
type Metrica = 'qtd' | 'lead' | 'sla' | 'aval';
const METRICAS: Record<Metrica, string> = {
  qtd: 'Quantidade', lead: 'Lead time (h)', sla: 'SLA %', aval: 'Avaliação',
};

const estrelas = (n: number | null) => (n === null ? '—' : `★ ${n.toFixed(1)}`);
const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const leadHoras = (d: Demanda): number | null =>
  d.concluida_em ? (new Date(d.concluida_em).getTime() - new Date(d.criado_em).getTime()) / 3600e3 : null;

function metricaDe(lista: Demanda[], m: Metrica): { valor: number | null; display: string } {
  const concl = lista.filter((d) => d.status === 'concluida');
  if (m === 'qtd') return { valor: concl.length, display: String(concl.length) };
  if (m === 'lead') {
    const hs = concl.map(leadHoras).filter((x): x is number => x !== null);
    if (!hs.length) return { valor: null, display: '—' };
    const v = Math.round(hs.reduce((a, b) => a + b, 0) / hs.length);
    return { valor: v, display: `${v}h` };
  }
  if (m === 'sla') {
    if (!concl.length) return { valor: null, display: '—' };
    const v = Math.round((concl.filter((d) =>
      d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada').length / concl.length) * 100);
    return { valor: v, display: `${v}%` };
  }
  const avals = concl.filter((d) => d.avaliacao_nota !== null);
  if (!avals.length) return { valor: null, display: '—' };
  const v = Math.round((avals.reduce((s, d) => s + (d.avaliacao_nota ?? 0), 0) / avals.length) * 10) / 10;
  return { valor: v, display: `★${v.toFixed(1)}` };
}

function useContagemAnexos(ids: string[]) {
  return useQuery({
    queryKey: ['anexos-contagem-dash', ids.slice().sort().join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('demanda_anexos').select('demanda_id').in('demanda_id', ids.slice(0, 800));
      if (error) throw new Error(error.message);
      const mapa = new Map<string, number>();
      for (const r of data ?? []) mapa.set(r.demanda_id as string, (mapa.get(r.demanda_id as string) ?? 0) + 1);
      return mapa;
    },
  });
}

// Gráfico de barras clicável (cross-filter)
function GraficoBarras(props: {
  titulo: string;
  linhas: { id: string; rotulo: string; valor: number | null; display: string }[];
  ativoId: string | null;
  cor: string;
  onClique: (id: string) => void;
}) {
  const max = Math.max(1, ...props.linhas.map((l) => l.valor ?? 0));
  return (
    <div className="cartao dash-grafico">
      <h3 style={{ marginBottom: 8 }}>{props.titulo}</h3>
      <div className="scroll-box" style={{ maxHeight: 196 }}>
        {props.linhas.length === 0 ? <p className="mudo">Sem dados no recorte.</p> :
          props.linhas.map((l) => {
            const ativo = props.ativoId === l.id;
            return (
              <div key={l.id} className={`dash-barra ${ativo ? 'ativa' : ''}`}
                   onClick={() => props.onClique(l.id)} role="button" tabIndex={0}
                   title="Clique para filtrar o painel">
                <span className="dash-barra-rotulo" title={l.rotulo}>{l.rotulo}</span>
                <div className="barra-h" style={{ flex: 1 }}>
                  <div style={{ width: `${((l.valor ?? 0) / max) * 100}%`, background: props.cor }} />
                </div>
                <span className="mudo" style={{ minWidth: 52, textAlign: 'right' }}>{l.display}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export function Desempenho() {
  const nav = useNavigate();
  const { data: demandas, isLoading } = useDemandas();
  const { data: pessoas } = usePessoas();
  const { data: areas } = useAreas();
  const { data: processos } = useProcessos();
  const { data: eu } = usePessoaAtual();

  const ehGestor = eu?.perfil === 'gestor' || eu?.perfil === 'admin' || eu?.perfil === 'executivo';

  const [periodo, setPeriodo] = useState<Periodo>('90');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [areaF, setAreaF] = useState<string[]>([]);
  const [pessoaF, setPessoaF] = useState<string[]>([]);
  const [processoF, setProcessoF] = useState<string[]>([]);
  const [tipoF, setTipoF] = useState<string[]>([]);
  const [metrica, setMetrica] = useState<Metrica>('qtd');
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [recF, setRecF] = useState('');
  const [situacaoSel, setSituacaoSel] = useState<'concluida' | 'atrasada' | 'andamento' | null>(null);
  const [ordem, setOrdem] = useState<{ col: string; asc: boolean }>({ col: 'prazo', asc: false });
  const [demandaSel, setDemandaSel] = useState<Demanda | null>(null);

  const pessoaEfetiva = ehGestor ? pessoaF : (eu ? [eu.id] : []);

  const faixa = useMemo<[string | null, string | null]>(() => {
    const hoje = new Date();
    switch (periodo) {
      case '30': return [isoDia(new Date(Date.now() - 30 * 86400e3)), null];
      case '90': return [isoDia(new Date(Date.now() - 90 * 86400e3)), null];
      case '365': return [isoDia(new Date(Date.now() - 365 * 86400e3)), null];
      case 'este_mes': return [isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), null];
      case 'mes_passado': return [
        isoDia(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
        isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 0))];
      case 'este_ano': return [`${hoje.getFullYear()}-01-01`, null];
      case 'custom': return [de || null, ate || null];
      default: return [null, null];
    }
  }, [periodo, de, ate]);

  // Base filtrada (sem o mês do cross-filter — o gráfico mensal precisa dela)
  const base = useMemo(() => {
    const [ini, fim] = faixa;
    return (demandas ?? []).filter((d) => {
      if (['solicitada', 'rejeitada'].includes(d.status)) return false;
      if (d.status === 'concluida' && d.concluida_em) {
        const dia = d.concluida_em.slice(0, 10);
        if (ini && dia < ini) return false;
        if (fim && dia > fim) return false;
      }
      if (areaF.length > 0 && !areaF.includes(d.area_id)) return false;
      if (pessoaEfetiva.length > 0 && !pessoaEfetiva.includes(d.responsavel_id ?? '')) return false;
      if (processoF.length > 0 && !processoF.includes(d.processo_id ?? '__avulsa')) return false;
      if (tipoF.length > 0 && !tipoF.includes(d.tipo)) return false;
      if (recF === 'sim' && d.recorrencia === null) return false;
      if (recF === 'nao' && d.recorrencia !== null) return false;
      return true;
    });
  }, [demandas, faixa, areaF, pessoaEfetiva, processoF, tipoF, recF]);

  // Recorte final (com o mês selecionado): competência = conclusão (finalizadas) ou prazo (ativas)
  const recorte = useMemo(() => {
    let lista = base;
    if (mesSel) {
      lista = lista.filter((d) => {
        const chave = d.status === 'concluida' || d.status === 'encerrada'
          ? (d.concluida_em ?? d.prazo).slice(0, 7)
          : d.prazo.slice(0, 7);
        return chave === mesSel;
      });
    }
    if (situacaoSel) {
      lista = lista.filter((d) => {
        const fin = ['concluida', 'encerrada'].includes(d.status);
        if (situacaoSel === 'concluida') return fin;
        if (situacaoSel === 'atrasada') return !fin && demandaAtrasada(d);
        return !fin && !demandaAtrasada(d);
      });
    }
    return lista;
  }, [base, mesSel, situacaoSel]);

  // Pizza: composição por situação (do recorte SEM o corte de situação, para navegar)
  const pizza = useMemo(() => {
    const lista = !mesSel ? base : base.filter((d) => {
      const chave = d.status === 'concluida' || d.status === 'encerrada'
        ? (d.concluida_em ?? d.prazo).slice(0, 7) : d.prazo.slice(0, 7);
      return chave === mesSel;
    });
    const conc = lista.filter((d) => ['concluida', 'encerrada'].includes(d.status)).length;
    const atra = lista.filter((d) => !['concluida', 'encerrada'].includes(d.status) && demandaAtrasada(d)).length;
    const anda = lista.length - conc - atra;
    return { conc, atra, anda, total: lista.length };
  }, [base, mesSel]);

  const concluidas = useMemo(() => recorte.filter((d) => d.status === 'concluida'), [recorte]);

  const kpis = useMemo(() => {
    const noPrazo = concluidas.filter((d) =>
      d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada').length;
    const hs = concluidas.map(leadHoras).filter((x): x is number => x !== null);
    const leadH = hs.length ? Math.round(hs.reduce((a, b) => a + b, 0) / hs.length) : null;
    const avals = concluidas.filter((d) => d.avaliacao_nota !== null);
    const ativas = recorte.filter((d) => !['concluida', 'encerrada'].includes(d.status));
    return {
      concluidas: concluidas.length,
      sla: concluidas.length ? Math.round((noPrazo / concluidas.length) * 100) : null,
      leadD: leadH !== null ? Math.round((leadH / 24) * 10) / 10 : null,
      leadH,
      retrabalho: concluidas.reduce((s, d) => s + d.retrabalho, 0),
      nota: avals.length ? Math.round((avals.reduce((s, d) => s + (d.avaliacao_nota ?? 0), 0) / avals.length) * 10) / 10 : null,
      pendAval: concluidas.length - avals.length,
      ativas: ativas.length,
      atrasadas: ativas.filter(demandaAtrasada).length,
    };
  }, [concluidas, recorte]);

  const porMes = useMemo(() => {
    const linhas: { id: string; rotulo: string; valor: number | null; display: string }[] = [];
    const agora = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const doMes = base.filter((x) => x.status === 'concluida' && x.concluida_em?.startsWith(chave));
      if (doMes.length === 0 && i > 5) continue;
      linhas.push({ id: chave, rotulo: fmtCompetencia(chave), ...metricaDe(doMes, metrica) });
    }
    return linhas;
  }, [base, metrica]);

  const porProcesso = useMemo(() => {
    const grupos = new Map<string, { rotulo: string; lista: Demanda[] }>();
    for (const d of concluidas) {
      const id = d.processo_id ?? '__avulsa';
      const g = grupos.get(id) ?? { rotulo: d.processo?.nome ?? 'Avulsas', lista: [] };
      g.lista.push(d);
      grupos.set(id, g);
    }
    return [...grupos.entries()]
      .map(([id, g]) => ({ id, rotulo: g.rotulo, ...metricaDe(g.lista, metrica) }))
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  }, [concluidas, metrica]);

  const porTipo = useMemo(() => {
    const grupos = new Map<string, Demanda[]>();
    for (const d of concluidas) grupos.set(d.tipo, [...(grupos.get(d.tipo) ?? []), d]);
    return [...grupos.entries()]
      .map(([id, lista]) => ({ id, rotulo: TIPO_DEMANDA[id as TipoDemanda], ...metricaDe(lista, metrica) }))
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  }, [concluidas, metrica]);

  // Tabela analítica
  const { data: contagemAnexos } = useContagemAnexos(recorte.map((d) => d.id));
  const slaDe = (d: Demanda): { rotulo: string; tom: 'saudavel' | 'critico' | 'atencao' | 'neutro' } => {
    if (d.status === 'concluida') {
      if (d.motivo_conclusao === 'com_atraso') return { rotulo: 'Com atraso', tom: 'critico' };
      return { rotulo: MOTIVO_CONCLUSAO[d.motivo_conclusao ?? 'no_prazo'], tom: 'saudavel' };
    }
    if (d.status === 'encerrada') return { rotulo: 'Encerrada', tom: 'neutro' };
    return demandaAtrasada(d) ? { rotulo: 'Atrasada', tom: 'critico' } : { rotulo: 'Em dia', tom: 'atencao' };
  };

  const tabela = useMemo(() => {
    const chaveDe = (d: Demanda): string | number => {
      switch (ordem.col) {
        case 'demanda': return d.titulo.toLowerCase();
        case 'processo': return (d.processo?.nome ?? 'zzz').toLowerCase();
        case 'prioridade': return ['critica', 'alta', 'media', 'baixa'].indexOf(d.prioridade);
        case 'entrega': return d.concluida_em ?? '';
        case 'sla': return slaDe(d).rotulo;
        case 'responsavel': return (d.responsavel?.nome ?? '').toLowerCase();
        default: return d.prazo;
      }
    };
    return [...recorte].sort((a, b) => {
      const va = chaveDe(a); const vb = chaveDe(b);
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return ordem.asc ? r : -r;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorte, ordem]);

  if (isLoading || !eu) return <Carregando linhas={6} />;

  const limparTudo = () => {
    setAreaF([]); setPessoaF([]); setProcessoF([]); setTipoF([]); setMesSel(null);
    setRecF(''); setSituacaoSel(null);
  };
  const temFiltro = areaF.length + pessoaF.length + processoF.length + tipoF.length > 0 || mesSel || recF || situacaoSel;

  const Cab = (p: { col: string; children: ReactNode; w?: string }) => (
    <span style={{ width: p.w, flexShrink: 0, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setOrdem((o) => ({ col: p.col, asc: o.col === p.col ? !o.asc : true }))}>
      {p.children}{ordem.col === p.col ? (ordem.asc ? ' ▲' : ' ▼') : ''}
    </span>
  );

  return (
    <div>
      {/* ===== Filtros ===== */}
      <div className="linha" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} style={{ maxWidth: 160 }}>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="365">Últimos 12 meses</option>
          <option value="este_mes">Este mês</option>
          <option value="mes_passado">Mês passado</option>
          <option value="este_ano">Este ano</option>
          <option value="tudo">Todo o histórico</option>
          <option value="custom">Personalizado…</option>
        </select>
        {periodo === 'custom' && (
          <>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={{ maxWidth: 155 }} />
            <span className="mudo">até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={{ maxWidth: 155 }} />
          </>
        )}
        <MultiFiltro rotulo="Áreas" selecionados={areaF} onChange={setAreaF}
          opcoes={(areas ?? []).map((a) => ({ id: a.id, nome: a.nome }))} />
        {ehGestor ? (
          <MultiFiltro rotulo="Pessoas" selecionados={pessoaF} onChange={setPessoaF}
            opcoes={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.nome }))} />
        ) : (
          <Badge tom="neutro">Meus números</Badge>
        )}
        <MultiFiltro rotulo="Processos" selecionados={processoF} onChange={setProcessoF}
          opcoes={[...(processos ?? []).map((p) => ({ id: p.id, nome: p.nome })),
                   { id: '__avulsa', nome: 'Avulsas (sem processo)' }]} />
        <MultiFiltro rotulo="Tipos" selecionados={tipoF} onChange={setTipoF}
          opcoes={(Object.entries(TIPO_DEMANDA) as [TipoDemanda, string][])
            .map(([k, v]) => ({ id: k, nome: v }))} />
        <select value={recF} onChange={(e) => setRecF(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="">Recorrência: todas</option>
          <option value="sim">Recorrentes</option>
          <option value="nao">Não recorrentes</option>
        </select>
        {mesSel && (
          <Badge tom="info">📅 {fmtCompetencia(mesSel)} ✕</Badge>
        )}
        {temFiltro && (
          <button className="btn mini" onClick={limparTudo}>Limpar filtros</button>
        )}
        <div className="espaco" />
        <span className="mudo">Métrica:</span>
        {(Object.entries(METRICAS) as [Metrica, string][]).map(([k, v]) => (
          <button key={k} className={`btn mini ${metrica === k ? 'primario' : ''}`}
                  onClick={() => setMetrica(k)}>{v}</button>
        ))}
      </div>

      {/* ===== Visão geral: KPIs + composição por situação ===== */}
      <div className="dash-topo secao">
      <div className="dash-kpis">
        <Kpi rotulo="Concluídas" valor={String(kpis.concluidas)} />
        <Kpi rotulo="SLA" valor={kpis.sla === null ? '—' : `${kpis.sla}%`}
             tom={kpis.sla !== null && kpis.sla < 70 ? 'critico' : kpis.sla !== null && kpis.sla >= 85 ? 'saudavel' : undefined} />
        <Kpi rotulo="Lead (dias)" valor={kpis.leadD === null ? '—' : `${kpis.leadD}`} />
        <Kpi rotulo="Lead (horas)" valor={kpis.leadH === null ? '—' : `${kpis.leadH}h`} />
        <Kpi rotulo="Retrabalho" valor={String(kpis.retrabalho)} tom={kpis.retrabalho > 0 ? 'critico' : undefined} />
        <Kpi rotulo="Avaliação" valor={estrelas(kpis.nota)} />
        <Kpi rotulo="Sem avaliação" valor={String(kpis.pendAval)} tom={kpis.pendAval > 0 ? 'atencao' : undefined} />
        <Kpi rotulo="Ativas" valor={String(kpis.ativas)} />
        <Kpi rotulo="Atrasadas" valor={String(kpis.atrasadas)} tom={kpis.atrasadas > 0 ? 'critico' : undefined} />
      </div>
      <PizzaStatus dados={pizza} ativo={situacaoSel}
        onClique={(s) => setSituacaoSel(situacaoSel === s ? null : s)} />
      </div>

      {/* ===== Gráficos com cross-filter ===== */}
      <div className="dash-graficos secao">
        <GraficoBarras titulo={`Por mês — ${METRICAS[metrica]}`} linhas={porMes}
          ativoId={mesSel} cor="var(--cor-primaria)"
          onClique={(id) => setMesSel(mesSel === id ? null : id)} />
        <GraficoBarras titulo={`Por processo — ${METRICAS[metrica]}`} linhas={porProcesso}
          ativoId={processoF.length === 1 ? processoF[0] : null} cor="var(--cor-saudavel)"
          onClique={(id) => setProcessoF(processoF.length === 1 && processoF[0] === id ? [] : [id])} />
        <GraficoBarras titulo={`Por tipo — ${METRICAS[metrica]}`} linhas={porTipo}
          ativoId={tipoF.length === 1 ? tipoF[0] : null} cor="var(--cor-atencao)"
          onClique={(id) => setTipoF(tipoF.length === 1 && tipoF[0] === id ? [] : [id])} />
      </div>

      {/* ===== Tabela analítica ===== */}
      <div className="cartao">
        <div className="linha" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Demandas do recorte</h3>
          <Badge tom="info">{tabela.length}</Badge>
          <div className="espaco" />
          <span className="mudo">clique na linha para o resumo · clique no cabeçalho para ordenar</span>
        </div>
        <div className="linha dash-tab-cab">
          <Cab col="demanda" w="24%">Demanda</Cab>
          <Cab col="processo" w="15%">Processo</Cab>
          <Cab col="prioridade" w="9%">Prioridade</Cab>
          <Cab col="prazo" w="9%">Prazo</Cab>
          <Cab col="entrega" w="9%">Entrega</Cab>
          <Cab col="sla" w="10%">SLA</Cab>
          <Cab col="responsavel" w="12%">Responsável</Cab>
          <span style={{ width: '7%', fontWeight: 600 }}>Recorrente</span>
          <span style={{ width: '5%', fontWeight: 600 }}>Anexo</span>
        </div>
        <div className="scroll-box" style={{ maxHeight: '38vh' }}>
          {tabela.length === 0 ? (
            <EstadoVazio titulo="Nada no recorte.">Ajuste os filtros acima.</EstadoVazio>
          ) : tabela.map((d) => {
            const s = slaDe(d);
            const nAnexos = contagemAnexos?.get(d.id) ?? 0;
            return (
              <div key={d.id} className="linha dash-tab-linha" onClick={() => setDemandaSel(d)}
                   role="button" tabIndex={0}>
                <span style={{ width: '24%' }} className="dash-corta" title={d.titulo}>{d.titulo}</span>
                <span style={{ width: '15%' }} className="dash-corta suave">{d.processo?.nome ?? 'Avulsa'}</span>
                <span style={{ width: '9%' }}>
                  <Badge tom={PRIORIDADE[d.prioridade].tom}>{PRIORIDADE[d.prioridade].rotulo}</Badge>
                </span>
                <span style={{ width: '9%' }} className="suave">{fmtData(d.prazo)}</span>
                <span style={{ width: '9%' }} className="suave">{d.concluida_em ? fmtData(d.concluida_em) : '—'}</span>
                <span style={{ width: '10%' }}><Badge tom={s.tom}>{s.rotulo}</Badge></span>
                <span style={{ width: '12%' }} className="dash-corta suave">{d.responsavel?.nome ?? '—'}</span>
                <span style={{ width: '7%' }} className="suave">
                  {d.recorrencia ? `↻ ${RECORRENCIA_DEMANDA[d.recorrencia].split(' ')[0]}` : '—'}
                </span>
                <span style={{ width: '5%' }} className="suave">{nAnexos > 0 ? `📎 ${nAnexos}` : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Resumo da demanda (drawer local) ===== */}
      {demandaSel && (
        <ResumoDemanda d={demandaSel} onFechar={() => setDemandaSel(null)}
          onAbrirCompleta={() => { const id = demandaSel.id; setDemandaSel(null); nav(`/demandas/inbox/${id}`); }} />
      )}
    </div>
  );
}

function Kpi(props: { rotulo: string; valor: string; tom?: 'critico' | 'atencao' | 'saudavel' }) {
  const cor = props.tom === 'critico' ? 'var(--cor-critico)'
    : props.tom === 'atencao' ? 'var(--cor-atencao)'
    : props.tom === 'saudavel' ? 'var(--cor-saudavel)' : 'var(--texto)';
  return (
    <div className="cartao dash-kpi">
      <div style={{ fontSize: 20, fontWeight: 700, color: cor, lineHeight: 1.15 }}>{props.valor}</div>
      <div className="mudo" style={{ fontSize: 11.5 }}>{props.rotulo}</div>
    </div>
  );
}

function ResumoDemanda(props: { d: Demanda; onFechar: () => void; onAbrirCompleta: () => void }) {
  const { d } = props;
  const { data: anexos } = useAnexos(d.id);
  const st = STATUS_DEMANDA[d.status];
  return (
    <>
      <div className="drawer-fundo" onClick={props.onFechar} />
      <aside className="drawer" style={{ width: 'min(560px, 92vw)' }} aria-label="Resumo da demanda">
        <header className="drawer-cabecalho" style={{ paddingBottom: 14 }}>
          <div className="linha">
            <span className="mudo">Resumo · {d.processo?.nome ?? 'Avulsa'}</span>
            <div className="espaco" />
            <button className="btn mini primario" onClick={props.onAbrirCompleta}>Abrir ficha completa</button>
            <button className="btn mini" onClick={props.onFechar}>✕</button>
          </div>
          <div className="linha" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 18 }}>{d.titulo}</h1>
            <Badge tom={demandaAtrasada(d) ? 'critico' : st.tom}>
              {demandaAtrasada(d) ? 'Atrasada' : st.rotulo}
            </Badge>
            {d.avaliacao_nota !== null && (
              <span style={{ color: 'var(--cor-atencao)' }}>{'★'.repeat(d.avaliacao_nota)}</span>
            )}
          </div>
        </header>
        <div className="drawer-corpo">
          <div className="grade" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
            <Info r="Responsável" v={d.responsavel?.nome ?? '—'} />
            <Info r="Criador" v={d.criador?.nome ?? '—'} />
            <Info r="Prazo" v={fmtData(d.prazo)} />
            <Info r="Entrega" v={d.concluida_em ? fmtData(d.concluida_em) : '—'} />
            <Info r="Tipo" v={TIPO_DEMANDA[d.tipo]} />
            <Info r="Prioridade / Valor" v={`${PRIORIDADE[d.prioridade].rotulo} / ${VALOR[d.valor]}`} />
            <Info r="Peso / Estimado" v={`${d.peso ?? '—'} / ${d.tempo_estimado_h ? d.tempo_estimado_h + 'h' : '—'}`} />
            <Info r="Recorrência" v={d.recorrencia ? `↻ ${RECORRENCIA_DEMANDA[d.recorrencia]}` : '—'} />
          </div>
          {d.descricao && (
            <div className="secao"><h3>Descrição</h3>
              <p className="suave" style={{ whiteSpace: 'pre-wrap' }}>{d.descricao}</p></div>
          )}
          {d.avaliacao_comentario && (
            <div className="secao"><h3>Comentário da avaliação</h3>
              <p className="suave">"{d.avaliacao_comentario}"</p></div>
          )}
          <div className="secao">
            <h3>Anexos {d.anexo_obrigatorio ? '(obrigatório)' : ''}</h3>
            {(anexos ?? []).length === 0 ? (
              <p className="mudo">Nenhum documento.</p>
            ) : (
              <ul className="lista-limpa">
                {(anexos ?? []).map((a) => (
                  <li key={a.id} className="suave" style={{ padding: '3px 0' }}>📄 {a.nome}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function Info(props: { r: string; v: string }) {
  return (
    <div>
      <div className="mudo" style={{ fontSize: 11.5 }}>{props.r}</div>
      <div>{props.v}</div>
    </div>
  );
}

// Donut por situação — 3 cores: concluída (verde), em andamento (âmbar), atrasada (vermelho).
// As fatias/legendas são clicáveis e recortam KPIs e tabela.
function PizzaStatus(props: {
  dados: { conc: number; atra: number; anda: number; total: number };
  ativo: 'concluida' | 'atrasada' | 'andamento' | null;
  onClique: (s: 'concluida' | 'atrasada' | 'andamento') => void;
}) {
  const { conc, atra, anda, total } = props.dados;
  const R = 52; const C = 2 * Math.PI * R;
  const seg = (n: number) => (total > 0 ? (n / total) * C : 0);
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const fatias: { chave: 'concluida' | 'andamento' | 'atrasada'; n: number; cor: string; rotulo: string }[] = [
    { chave: 'concluida', n: conc, cor: 'var(--cor-saudavel)', rotulo: 'Concluídas' },
    { chave: 'andamento', n: anda, cor: 'var(--cor-atencao)', rotulo: 'Em andamento' },
    { chave: 'atrasada', n: atra, cor: 'var(--cor-critico)', rotulo: 'Atrasadas' },
  ];
  let acumulado = 0;
  return (
    <div className="cartao" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 16px' }}>
      <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="Demandas por situação">
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--cor-info-suave)" strokeWidth="22" />
        {fatias.map((f) => {
          const el = f.n > 0 && (
            <circle key={f.chave} cx="66" cy="66" r={R} fill="none"
              stroke={f.cor} strokeWidth={props.ativo === f.chave ? 26 : 22}
              strokeDasharray={`${seg(f.n)} ${C - seg(f.n)}`}
              strokeDashoffset={-acumulado}
              transform="rotate(-90 66 66)"
              style={{ cursor: 'pointer', opacity: props.ativo && props.ativo !== f.chave ? 0.35 : 1,
                       transition: 'opacity 150ms ease-out' }}
              onClick={() => props.onClique(f.chave)} />
          );
          acumulado += seg(f.n);
          return el;
        })}
        <text x="66" y="62" textAnchor="middle" style={{ fontSize: 22, fontWeight: 700, fill: 'var(--texto)' }}>
          {total}
        </text>
        <text x="66" y="80" textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--texto-mudo)' }}>
          demandas
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{ margin: 0 }}>Por situação</h3>
        {fatias.map((f) => (
          <button key={f.chave} className="dash-barra" style={{ padding: '3px 6px' }}
                  onClick={() => props.onClique(f.chave)}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: f.cor, flexShrink: 0,
                           outline: props.ativo === f.chave ? '2px solid var(--cor-primaria)' : 'none' }} />
            <span style={{ fontSize: 12.5 }}>{f.rotulo}</span>
            <span className="mudo" style={{ marginLeft: 'auto' }}>
              {f.n} · {pct(f.n)}%{props.ativo === f.chave ? ' ✕' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
