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
  STATUS_DEMANDA, TIPO_DEMANDA, type TipoDemanda, VALOR, demandaAtrasada, ehSubstituicao,
} from '../../domain/demandas';
import { fmtCompetencia, fmtData } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import { MultiFiltro } from '../../components/MultiFiltro';
import { CampoFiltro, PainelFiltros } from '../../components/PainelFiltros';
import { useAnexos } from '../demandas/Anexos';
import {
  calcularNota, faixaNota, pesoEfetivo, diasAtraso,
  MULT_PRIORIDADE, MULT_VALOR, MULT_COMPLEXIDADE,
} from '../../domain/desempenho';
import type { NotaDesempenho } from '../../domain/desempenho';

type Periodo = '30' | '90' | '365' | 'este_mes' | 'mes_passado' | 'este_ano' | 'tudo' | 'custom';
type Metrica = 'qtd' | 'peso' | 'atraso' | 'sla' | 'nota';
const METRICAS: Record<Metrica, string> = {
  qtd: 'Quantidade', peso: 'Peso médio', atraso: 'Atraso médio (d)', sla: 'SLA %', nota: 'Nota',
};

const estrelas = (n: number | null) => (n === null ? '—' : `★ ${n.toFixed(1)}`);
const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type Escala = 'dia' | 'semana' | 'mes';
const DIA_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Data de competência da demanda: entrega quando finalizada, prazo quando ativa. */
const dataCompetencia = (d: Demanda): string =>
  (d.status === 'concluida' || d.status === 'encerrada' ? (d.concluida_em ?? d.prazo) : d.prazo).slice(0, 10);

/** Segunda-feira da semana de uma data ISO. */
const segundaDe = (iso: string): string => {
  const [y, m, dd] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
};

const chaveEscala = (iso: string, e: Escala): string =>
  e === 'mes' ? iso.slice(0, 7) : e === 'dia' ? iso : segundaDe(iso);

/** Rótulo em duas linhas: principal + apoio (dia da semana, ano ou fim da semana). */
function rotuloEscala(chave: string, e: Escala): { p: string; s: string } {
  if (e === 'mes') {
    const [y, m] = chave.split('-').map(Number);
    return { p: MES_ABR[m - 1], s: String(y) };
  }
  const [y, m, d] = chave.split('-').map(Number);
  if (e === 'dia') {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return { p: `${d}/${m}`, s: DIA_SEM[dt.getUTCDay()] };
  }
  const fim = new Date(Date.UTC(y, m - 1, d + 6));
  return { p: `${d}/${m}`, s: `a ${fim.getUTCDate()}/${fim.getUTCMonth() + 1}` };
}

/** Dias vencidos de uma demanda ainda não entregue (0 se está em dia). */
const diasVencidos = (d: Demanda): number => {
  const hoje = new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00Z').getTime();
  const prazo = new Date(d.prazo + 'T12:00:00Z').getTime();
  return Math.max(0, Math.round((hoje - prazo) / 86400e3));
};

function metricaDe(lista: Demanda[], m: Metrica): { valor: number | null; display: string } {
  const concl = lista.filter((d) => d.status === 'concluida');
  if (m === 'qtd') return { valor: concl.length, display: String(concl.length) };
  if (m === 'atraso') {
    const atrs = concl.map(diasAtraso).filter((x) => x > 0);
    if (!concl.length) return { valor: null, display: '—' };
    if (!atrs.length) return { valor: 0, display: '0 d' };
    const v = Math.round((atrs.reduce((a, b) => a + b, 0) / atrs.length) * 10) / 10;
    return { valor: v, display: `${v} d` };
  }
  if (m === 'sla') {
    if (!concl.length) return { valor: null, display: '—' };
    const v = Math.round((concl.filter((d) =>
      d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada').length / concl.length) * 100);
    return { valor: v, display: `${v}%` };
  }
  if (m === 'peso') {
    if (!concl.length) return { valor: null, display: '—' };
    const v = Math.round((concl.reduce((s, d) => s + pesoEfetivo(d), 0) / concl.length) * 10) / 10;
    return { valor: v, display: v.toFixed(1) };
  }
  // nota
  const n = calcularNota(concl);
  return { valor: n.nota, display: n.nota === null ? '—' : String(n.nota) };
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
  const [periodoSel, setPeriodoSel] = useState<{ escala: Escala; chave: string } | null>(null);
  const [recF, setRecF] = useState('');
  const [situacaoSel, setSituacaoSel] = useState<'concluida' | 'atrasada' | 'andamento' | null>(null);
  const [ordem, setOrdem] = useState<{ col: string; asc: boolean }>({ col: 'prazo', asc: false });
  const [demandaSel, setDemandaSel] = useState<Demanda | null>(null);
  const [colFiltros, setColFiltros] = useState<Record<string, string>>({});
  const [escala, setEscala] = useState<Escala>('mes');
  const setCol = (k: string, v: string) => setColFiltros((f) => ({ ...f, [k]: v }));

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
    if (periodoSel) {
      lista = lista.filter((d) =>
        chaveEscala(dataCompetencia(d), periodoSel.escala) === periodoSel.chave);
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
  }, [base, periodoSel, situacaoSel]);

  // Pizza: composição por situação (do recorte SEM o corte de situação, para navegar)
  const pizza = useMemo(() => {
    const lista = !periodoSel ? base : base.filter((d) =>
      chaveEscala(dataCompetencia(d), periodoSel.escala) === periodoSel.chave);
    const conc = lista.filter((d) => ['concluida', 'encerrada'].includes(d.status)).length;
    const atra = lista.filter((d) => !['concluida', 'encerrada'].includes(d.status) && demandaAtrasada(d)).length;
    const anda = lista.length - conc - atra;
    return { conc, atra, anda, total: lista.length };
  }, [base, periodoSel]);

  const concluidas = useMemo(() => recorte.filter((d) => d.status === 'concluida'), [recorte]);

  const kpis = useMemo(() => {
    const noPrazo = concluidas.filter((d) =>
      d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada').length;
    const atrasos = concluidas.map(diasAtraso).filter((x) => x > 0);
    const atrasoMedio = atrasos.length
      ? Math.round((atrasos.reduce((a, b) => a + b, 0) / atrasos.length) * 10) / 10 : null;
    const avals = concluidas.filter((d) => d.avaliacao_nota !== null);
    const ativas = recorte.filter((d) => !['concluida', 'encerrada'].includes(d.status));
    const pesos = concluidas.map(pesoEfetivo);
    const pesoTotal = pesos.reduce((a, b) => a + b, 0);
    return {
      pesoMedio: concluidas.length ? Math.round((pesoTotal / concluidas.length) * 10) / 10 : null,
      pesoTotal: Math.round(pesoTotal),
      concluidas: concluidas.length,
      sla: concluidas.length ? Math.round((noPrazo / concluidas.length) * 100) : null,
      atrasoMedio,
      qtdAtrasadas: atrasos.length,
      pctAtrasadas: concluidas.length ? Math.round((atrasos.length / concluidas.length) * 100) : null,
      atrasoMax: atrasos.length ? Math.max(...atrasos) : 0,
      retrabalho: concluidas.reduce((s, d) => s + d.retrabalho, 0),
      nota: avals.length ? Math.round((avals.reduce((s, d) => s + (d.avaliacao_nota ?? 0), 0) / avals.length) * 10) / 10 : null,
      pendAval: concluidas.length - avals.length,
      ativas: ativas.length,
      atrasadas: ativas.filter(demandaAtrasada).length,
    };
  }, [concluidas, recorte]);

  // Referência de entrega: maior peso entregue por uma pessoa no recorte
  const referenciaEntrega = useMemo(() => {
    const porPessoa = new Map<string, number>();
    for (const d of concluidas) {
      const k = d.responsavel_id ?? '';
      porPessoa.set(k, (porPessoa.get(k) ?? 0) + pesoEfetivo(d));
    }
    return Math.max(1, ...porPessoa.values());
  }, [concluidas]);

  const porDemanda = useMemo(() => {
    const base = (t: string) => t.replace(/ — \d{4}-\d{2}$/, '');
    const grupos = new Map<string, Demanda[]>();
    for (const d of concluidas) {
      const k = base(d.titulo);
      grupos.set(k, [...(grupos.get(k) ?? []), d]);
    }
    return [...grupos.entries()]
      .map(([rotulo, lista]) => ({ id: rotulo, rotulo, ...metricaDe(lista, metrica) }))
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
      .slice(0, 25);
  }, [concluidas, metrica]);

  // Série temporal na escala escolhida — sempre sobre a BASE, para que
  // selecionar um período não faça o próprio gráfico sumir (cross-filter).
  const serie = useMemo(() => {
    const grupos = new Map<string, Demanda[]>();
    for (const d of base) {
      if (d.status !== 'concluida' || !d.concluida_em) continue;
      const k = chaveEscala(d.concluida_em.slice(0, 10), escala);
      grupos.set(k, [...(grupos.get(k) ?? []), d]);
    }
    const limite = escala === 'dia' ? 45 : escala === 'semana' ? 20 : 14;
    return [...grupos.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-limite)
      .map(([k, lista]) => ({
        id: k, qtd: lista.length,
        ...rotuloEscala(k, escala),
        ...metricaDe(lista, metrica),
      }));
  }, [base, metrica, escala]);

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
        case 'peso': return pesoEfetivo(d);
        case 'nota': return d.status === 'concluida' ? notaDemanda(d) : 0;
        case 'entrega': return d.concluida_em ?? '';
        case 'sla': return slaDe(d).rotulo;
        case 'responsavel': return (d.responsavel?.nome ?? '').toLowerCase();
        default: return d.prazo;
      }
    };
    const texto = (d: Demanda, col: string): string => {
      switch (col) {
        case 'demanda': return d.titulo;
        case 'processo': return d.processo?.nome ?? 'Avulsa';
        case 'prioridade': return PRIORIDADE[d.prioridade].rotulo;
        case 'peso': return String(pesoEfetivo(d));
        case 'prazo': return fmtData(d.prazo);
        case 'entrega': return d.concluida_em ? fmtData(d.concluida_em) : '';
        case 'sla': return slaDe(d).rotulo;
        case 'nota': return d.status === 'concluida' ? String(notaDemanda(d)) : '0';
        case 'responsavel': return d.responsavel?.nome ?? '';
        case 'recorrente': return d.recorrencia ? RECORRENCIA_DEMANDA[d.recorrencia] : '';
        default: return '';
      }
    };
    const filtrado = recorte.filter((d) =>
      Object.entries(colFiltros).every(([col, val]) =>
        !val || texto(d, col).toLowerCase().includes(val.toLowerCase())));

    return [...filtrado].sort((a, b) => {
      const va = chaveDe(a); const vb = chaveDe(b);
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return ordem.asc ? r : -r;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorte, ordem, colFiltros]);

  if (isLoading || !eu) return <Carregando linhas={6} />;

  const limparTudo = () => {
    setAreaF([]); setPessoaF([]); setProcessoF([]); setTipoF([]); setPeriodoSel(null);
    setRecF(''); setSituacaoSel(null); setPeriodo('90'); setDe(''); setAte('');
  };
  const ativosFiltro = areaF.length + pessoaF.length + processoF.length + tipoF.length
    + (recF ? 1 : 0) + (periodo !== '90' ? 1 : 0);
  const temFiltro = areaF.length + pessoaF.length + processoF.length + tipoF.length > 0 || periodoSel || recF || situacaoSel;

  const Cab = (p: { col: string; children: ReactNode; w?: string }) => (
    <span style={{ width: p.w, flexShrink: 0, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setOrdem((o) => ({ col: p.col, asc: o.col === p.col ? !o.asc : true }))}>
      {p.children}{ordem.col === p.col ? (ordem.asc ? ' ▲' : ' ▼') : ''}
    </span>
  );

  return (
    <div>
      {/* ===== Barra limpa: painel de filtros + recortes ativos + métrica ===== */}
      <div className="linha" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <PainelFiltros ativos={ativosFiltro} onLimpar={limparTudo}>
          <CampoFiltro rotulo="Período">
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
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
              <div className="linha" style={{ marginTop: 8 }}>
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
                <span className="mudo">até</span>
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
              </div>
            )}
          </CampoFiltro>
          <CampoFiltro rotulo="Áreas">
            <MultiFiltro rotulo="Áreas" selecionados={areaF} onChange={setAreaF}
              opcoes={(areas ?? []).map((a) => ({ id: a.id, nome: a.nome }))} />
          </CampoFiltro>
          {ehGestor && (
            <CampoFiltro rotulo="Pessoas">
              <MultiFiltro rotulo="Pessoas" selecionados={pessoaF} onChange={setPessoaF}
                opcoes={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.nome }))} />
            </CampoFiltro>
          )}
          <CampoFiltro rotulo="Processos">
            <MultiFiltro rotulo="Processos" selecionados={processoF} onChange={setProcessoF}
              opcoes={[...(processos ?? []).map((p) => ({ id: p.id, nome: p.nome })),
                       { id: '__avulsa', nome: 'Avulsas (sem processo)' }]} />
          </CampoFiltro>
          <CampoFiltro rotulo="Tipos">
            <MultiFiltro rotulo="Tipos" selecionados={tipoF} onChange={setTipoF}
              opcoes={(Object.entries(TIPO_DEMANDA) as [TipoDemanda, string][])
                .map(([k, v]) => ({ id: k, nome: v }))} />
          </CampoFiltro>
          <CampoFiltro rotulo="Recorrência">
            <select value={recF} onChange={(e) => setRecF(e.target.value)}>
              <option value="">Todas</option>
              <option value="sim">Recorrentes</option>
              <option value="nao">Não recorrentes</option>
            </select>
          </CampoFiltro>
        </PainelFiltros>
        {!ehGestor && <Badge tom="neutro">Meus números</Badge>}
        {periodoSel && (
          <button className="btn mini" onClick={() => setPeriodoSel(null)}>
            📅 {periodoSel.escala === 'mes' ? 'Mês' : periodoSel.escala === 'semana' ? 'Semana de' : ''}{' '}
            {rotuloEscala(periodoSel.chave, periodoSel.escala).p}
            {periodoSel.escala !== 'dia' ? ` ${rotuloEscala(periodoSel.chave, periodoSel.escala).s}` : ''} ✕
          </button>
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
        <Kpi rotulo="Atraso médio" nota={kpis.qtdAtrasadas
               ? `${kpis.qtdAtrasadas} de ${kpis.concluidas} (${kpis.pctAtrasadas}%) · pior ${kpis.atrasoMax} d`
               : kpis.concluidas ? 'nenhuma entrega atrasada' : undefined}
             valor={kpis.atrasoMedio === null ? (kpis.concluidas ? '0 d' : '—') : `${kpis.atrasoMedio} d`}
             tom={kpis.atrasoMedio === null ? (kpis.concluidas ? 'saudavel' : undefined)
                  : kpis.atrasoMedio >= 5 ? 'critico' : kpis.atrasoMedio >= 2 ? 'atencao' : undefined} />
        <Kpi rotulo="Retrabalho" valor={String(kpis.retrabalho)} tom={kpis.retrabalho > 0 ? 'critico' : undefined} />
        <Kpi rotulo="Peso médio" valor={kpis.pesoMedio === null ? '—' : String(kpis.pesoMedio)} />
        <Kpi rotulo="Ativas" valor={String(kpis.ativas)} />
        <Kpi rotulo="Atrasadas" valor={String(kpis.atrasadas)} tom={kpis.atrasadas > 0 ? 'critico' : undefined} />
      </div>
      <PizzaStatus dados={pizza} ativo={situacaoSel}
        onClique={(s) => setSituacaoSel(situacaoSel === s ? null : s)} />
      </div>

      {/* ===== Nota de Desempenho ===== */}
      <PainelNota concluidas={concluidas} referencia={referenciaEntrega}
        alvo={pessoaF.length === 1
          ? (pessoas ?? []).find((p) => p.id === pessoaF[0])?.nome ?? 'a pessoa'
          : ehGestor ? 'a equipe' : 'você'} />

      {/* ===== Gráficos com cross-filter ===== */}
      <div className="dash-graficos secao">
        <GraficoBarras titulo={`Por demanda — ${METRICAS[metrica]}`} linhas={porDemanda}
          ativoId={null} cor="var(--cor-primaria)"
          onClique={(id) => setCol('demanda', colFiltros['demanda'] === id ? '' : id)} />
        <GraficoBarras titulo={`Por processo — ${METRICAS[metrica]}`} linhas={porProcesso}
          ativoId={processoF.length === 1 ? processoF[0] : null} cor="var(--cor-saudavel)"
          onClique={(id) => setProcessoF(processoF.length === 1 && processoF[0] === id ? [] : [id])} />
        <GraficoBarras titulo={`Por tipo — ${METRICAS[metrica]}`} linhas={porTipo}
          ativoId={tipoF.length === 1 ? tipoF[0] : null} cor="var(--cor-atencao)"
          onClique={(id) => setTipoF(tipoF.length === 1 && tipoF[0] === id ? [] : [id])} />
      </div>

      {/* ===== Evolução no tempo ===== */}
      <SerieTemporal titulo={`Evolução — ${METRICAS[metrica]}`} serie={serie}
        escala={escala} onEscala={setEscala}
        ativo={periodoSel && periodoSel.escala === escala ? periodoSel.chave : null}
        onClique={(chave) => setPeriodoSel(
          periodoSel && periodoSel.escala === escala && periodoSel.chave === chave
            ? null : { escala, chave })} />

      {/* ===== Tabela analítica ===== */}
      <div className="cartao">
        <div className="linha" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Demandas do recorte</h3>
          <Badge tom="info">{tabela.length}</Badge>
          {Object.values(colFiltros).some(Boolean) && (
            <button className="btn mini" onClick={() => setColFiltros({})}>Limpar filtros da tabela</button>
          )}
          <div className="espaco" />
          <button className="btn mini" onClick={() => exportarTabela(tabela, contagemAnexos)}>
            ⬇ Exportar Excel
          </button>
        </div>
        <div className="dash-tab-wrap">
          <table className="dash-tabela">
            <thead>
              <tr className="dash-th">
                <th style={{ width: 300 }} onClick={() => setOrdem((o) => ({ col: 'demanda', asc: o.col === 'demanda' ? !o.asc : true }))}>
                  Demanda{ordem.col === 'demanda' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 170 }} onClick={() => setOrdem((o) => ({ col: 'processo', asc: o.col === 'processo' ? !o.asc : true }))}>
                  Processo{ordem.col === 'processo' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 95 }} onClick={() => setOrdem((o) => ({ col: 'prioridade', asc: o.col === 'prioridade' ? !o.asc : true }))}>
                  Prioridade{ordem.col === 'prioridade' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 70 }} onClick={() => setOrdem((o) => ({ col: 'peso', asc: o.col === 'peso' ? !o.asc : true }))}>
                  Peso{ordem.col === 'peso' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 95 }} onClick={() => setOrdem((o) => ({ col: 'prazo', asc: o.col === 'prazo' ? !o.asc : true }))}>
                  Prazo{ordem.col === 'prazo' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 95 }} onClick={() => setOrdem((o) => ({ col: 'entrega', asc: o.col === 'entrega' ? !o.asc : true }))}>
                  Entrega{ordem.col === 'entrega' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 110 }} onClick={() => setOrdem((o) => ({ col: 'sla', asc: o.col === 'sla' ? !o.asc : true }))}>
                  SLA{ordem.col === 'sla' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 75 }} onClick={() => setOrdem((o) => ({ col: 'nota', asc: o.col === 'nota' ? !o.asc : true }))}>
                  Nota{ordem.col === 'nota' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 130 }} onClick={() => setOrdem((o) => ({ col: 'responsavel', asc: o.col === 'responsavel' ? !o.asc : true }))}>
                  Responsável{ordem.col === 'responsavel' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 95 }} onClick={() => setOrdem((o) => ({ col: 'recorrente', asc: o.col === 'recorrente' ? !o.asc : true }))}>
                  Recorrente{ordem.col === 'recorrente' ? (ordem.asc ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ width: 70 }}>Anexo</th>
              </tr>
              <tr className="dash-tr-filtro">
                <th style={{ width: 300 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['demanda'] ?? ''}
                         onChange={(e) => setCol('demanda', e.target.value)} />
                </th>
                <th style={{ width: 170 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['processo'] ?? ''}
                         onChange={(e) => setCol('processo', e.target.value)} />
                </th>
                <th style={{ width: 95 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['prioridade'] ?? ''}
                         onChange={(e) => setCol('prioridade', e.target.value)} />
                </th>
                <th style={{ width: 70 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['peso'] ?? ''}
                         onChange={(e) => setCol('peso', e.target.value)} />
                </th>
                <th style={{ width: 95 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['prazo'] ?? ''}
                         onChange={(e) => setCol('prazo', e.target.value)} />
                </th>
                <th style={{ width: 95 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['entrega'] ?? ''}
                         onChange={(e) => setCol('entrega', e.target.value)} />
                </th>
                <th style={{ width: 110 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['sla'] ?? ''}
                         onChange={(e) => setCol('sla', e.target.value)} />
                </th>
                <th style={{ width: 75 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['nota'] ?? ''}
                         onChange={(e) => setCol('nota', e.target.value)} />
                </th>
                <th style={{ width: 130 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['responsavel'] ?? ''}
                         onChange={(e) => setCol('responsavel', e.target.value)} />
                </th>
                <th style={{ width: 95 }}>
                  <input type="text" placeholder="filtrar…" value={colFiltros['recorrente'] ?? ''}
                         onChange={(e) => setCol('recorrente', e.target.value)} />
                </th>
                <th style={{ width: 70 }} />
              </tr>
            </thead>
            <tbody>
              {tabela.map((d) => {
                const s = slaDe(d);
                const nAnexos = contagemAnexos?.get(d.id) ?? 0;
                return (
                  <tr key={d.id} onClick={() => setDemandaSel(d)}>
                    <td className="dash-corta" title={d.titulo}>{d.titulo}</td>
                    <td className="dash-corta suave">{d.processo?.nome ?? 'Avulsa'}</td>
                    <td><Badge tom={PRIORIDADE[d.prioridade].tom}>{PRIORIDADE[d.prioridade].rotulo}</Badge></td>
                    <td className="suave" title={`peso ${d.peso ?? 5}, ajustado por prioridade, valor e complexidade`}>
                      {pesoEfetivo(d).toFixed(1)}
                    </td>
                    <td className="suave">{fmtData(d.prazo)}</td>
                    <td className="suave">{d.concluida_em ? fmtData(d.concluida_em) : '—'}</td>
                    <td><Badge tom={s.tom}>{s.rotulo}</Badge></td>
                    <td>
                      {d.status === 'concluida'
                        ? <Badge tom={faixaNota(notaDemanda(d)).tom}>{notaDemanda(d)}</Badge>
                        : <span className="suave">0</span>}
                    </td>
                    <td className="dash-corta suave">{ehSubstituicao(d) ? '🔄 ' : ''}{d.responsavel?.nome ?? '—'}</td>
                    <td className="suave">{d.recorrencia ? `↻ ${RECORRENCIA_DEMANDA[d.recorrencia].split(' ')[0]}` : '—'}</td>
                    <td className="suave">{nAnexos > 0 ? `📎 ${nAnexos}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tabela.length === 0 && <EstadoVazio titulo="Nada no recorte.">Ajuste os filtros acima.</EstadoVazio>}
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

interface PontoSerie { id: string; p: string; s: string; qtd: number; valor: number | null; display: string }

function SerieTemporal(props: {
  titulo: string; serie: PontoSerie[]; escala: Escala;
  onEscala: (e: Escala) => void; ativo: string | null; onClique: (chave: string) => void;
}) {
  const { serie } = props;
  const valores = serie.map((s) => s.valor ?? 0);
  const max = Math.max(1, ...valores);
  const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
  const ALTURA = 190;
  const escalaY = (v: number) => Math.max(2, Math.round((v / max) * ALTURA));

  return (
    <div className="cartao secao serie-box">
      <div className="linha" style={{ marginBottom: 2, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{props.titulo}</h3>
        {props.ativo && <Badge tom="info">período selecionado</Badge>}
        <div className="espaco" />
        <div className="serie-toggle">
          {(['dia', 'semana', 'mes'] as Escala[]).map((k) => (
            <button key={k} className={props.escala === k ? 'ativo' : ''}
                    onClick={() => props.onEscala(k)}>
              {k === 'dia' ? 'Diário' : k === 'semana' ? 'Semanal' : 'Mensal'}
            </button>
          ))}
        </div>
      </div>

      {serie.length === 0 ? (
        <p className="mudo">Sem entregas concluídas no recorte.</p>
      ) : (
        <>
          <div className="serie-plot" style={{ ['--h' as string]: `${ALTURA}px` }}>
            <div className="serie-grade">
              {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                <div key={f} className="serie-linha" style={{ bottom: `${f * ALTURA}px` }}>
                  <span>{Math.round(max * f)}</span>
                </div>
              ))}
              {media > 0 && (
                <div className="serie-media" style={{ bottom: `${escalaY(media)}px` }}>
                  <span>média {Math.round(media * 10) / 10}</span>
                </div>
              )}
            </div>
            <div className="serie-barras">
              {serie.map((s) => {
                const sel = props.ativo === s.id;
                const apagada = props.ativo !== null && !sel;
                return (
                  <button key={s.id} type="button"
                          className={`serie-col${sel ? ' sel' : ''}${apagada ? ' apagada' : ''}`}
                          title={`${s.p} ${s.s} · ${s.display} · ${s.qtd} entrega(s)`}
                          onClick={() => props.onClique(s.id)}>
                    <span className="serie-val">{s.display}</span>
                    <span className="serie-barra" style={{ height: escalaY(s.valor ?? 0) }} />
                    <span className="serie-rot">{s.p}</span>
                    <span className="serie-sub">{s.s}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mudo serie-dica">
            Clique em uma barra para filtrar a tela inteira por aquele período.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi(props: { rotulo: string; valor: string; nota?: string; tom?: 'critico' | 'atencao' | 'saudavel' }) {
  const cor = props.tom === 'critico' ? 'var(--cor-critico)'
    : props.tom === 'atencao' ? 'var(--cor-atencao)'
    : props.tom === 'saudavel' ? 'var(--cor-saudavel)' : 'var(--texto)';
  return (
    <div className="cartao dash-kpi">
      <div style={{ fontSize: 20, fontWeight: 700, color: cor, lineHeight: 1.15 }}>{props.valor}</div>
      <div className="mudo" style={{ fontSize: 11.5 }}>{props.rotulo}</div>
      {props.nota && <div className="mudo" style={{ fontSize: 10.5, marginTop: 2 }}>{props.nota}</div>}
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
            <Info r="Responsável" v={`${d.responsavel?.nome ?? '—'}${ehSubstituicao(d) ? ' (substituição)' : ''}`} />
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

// Nota de Desempenho — ranking de criticidade (peso × prioridade × valor × complexidade)
function PainelNota(props: {
  concluidas: Demanda[];
  referencia: number;
  alvo: string;
}) {
  const n = calcularNota(props.concluidas, props.referencia);
  const [aberto, setAberto] = useState(false);
  const [explica, setExplica] = useState(false);
  if (n.nota === null) {
    return (
      <div className="cartao secao">
        <h3 style={{ margin: 0 }}>Nota de Desempenho</h3>
        <p className="mudo" style={{ marginTop: 6 }}>Sem entregas concluídas no recorte.</p>
      </div>
    );
  }
  const f = faixaNota(n.nota);
  const cor = f.tom === 'saudavel' ? 'var(--cor-saudavel)'
    : f.tom === 'info' ? 'var(--cor-primaria)'
    : f.tom === 'atencao' ? 'var(--cor-atencao)' : 'var(--cor-critico)';

  return (
    <div className="cartao secao" style={{ borderLeft: `3px solid ${cor}` }}>
      <div className="linha" style={{ cursor: 'pointer', flexWrap: 'wrap' }}
           onClick={() => setAberto(!aberto)} role="button" tabIndex={0} aria-expanded={aberto}>
        <h3 style={{ margin: 0 }}>Nota de Desempenho — {props.alvo}</h3>
        <strong style={{ fontSize: 26, color: cor }}>{n.nota}</strong>
        <span className="mudo">/100</span>
        <Badge tom={f.tom}>{f.rotulo}</Badge>
        {n.amostraPequena && <Badge tom="atencao">amostra pequena ({n.concluidas})</Badge>}
        <button className="btn-ajuda" title="Como esta nota é calculada?"
                aria-label="Como esta nota é calculada?"
                onClick={(e) => { e.stopPropagation(); setExplica(true); }}>?</button>
        <span className="mudo">· peso médio {n.pesoMedio} · {n.pesoTotal} pontos entregues</span>
        <div className="espaco" />
        <span className="mudo">{aberto ? 'ocultar ▴' : 'ver composição ▾'}</span>
      </div>

      {aberto && (
        <>
          <ul className="lista-limpa" style={{ marginTop: 12 }}>
            {n.componentes.map((c) => (
              <li key={c.nome} className="linha"
                  style={{ padding: '7px 0', borderBottom: '1px solid var(--borda)' }}>
                <span style={{ minWidth: 190 }}>{c.nome}</span>
                <div className="barra-h" style={{ flex: 1 }}>
                  <div style={{ width: `${c.valor}%`,
                    background: c.valor >= 85 ? 'var(--cor-saudavel)'
                      : c.valor >= 60 ? 'var(--cor-atencao)' : 'var(--cor-critico)' }} />
                </div>
                <span className="mudo" style={{ minWidth: 210, textAlign: 'right' }}>
                  {c.valor}% · peso {c.peso} · {c.detalhe}
                </span>
              </li>
            ))}
          </ul>
          <p className="mudo" style={{ marginTop: 10 }}>
            Cada demanda vale conforme sua criticidade: peso (1–10) × prioridade × valor × complexidade.
            Atrasar uma demanda crítica pesa muito mais que atrasar uma rotina simples.
            Leitura de desenvolvimento, nunca ranking público (Art. 42.10).
          </p>
        </>
      )}

      {explica && (
        <ExplicaNota n={n} alvo={props.alvo} concluidas={props.concluidas}
                     onFechar={() => setExplica(false)} />
      )}
    </div>
  );
}

/** Explicação da nota: método + o cálculo real deste recorte. */
function ExplicaNota(props: {
  n: NotaDesempenho; alvo: string; concluidas: Demanda[]; onFechar: () => void;
}) {
  const { n } = props;
  const soma = n.componentes.reduce((s, c) => s + (c.valorExato * c.peso) / 100, 0);
  const num = (v: number) => Math.round(v * 10) / 10;

  // Demanda mais crítica do recorte, para ilustrar o peso efetivo
  const exemplo = [...props.concluidas].sort((a, b) => pesoEfetivo(b) - pesoEfetivo(a))[0];

  return (
    <div className="modal-fundo" onClick={props.onFechar}>
      <div className="modal modal-largo" onClick={(e) => e.stopPropagation()}>
        <h2>Como a nota é calculada</h2>
        <p className="suave">
          A nota vai de 0 a 100 e mede a <strong>entrega ponderada pela criticidade</strong>.
          Uma demanda crítica de peso 10 atrasada derruba a nota muito mais que uma rotina simples de peso 2.
        </p>

        <h3 className="secao">1 · Quanto cada demanda vale (peso efetivo)</h3>
        <p className="mudo" style={{ marginTop: 4 }}>
          peso efetivo = peso informado (1–10) × média dos ajustes de prioridade, valor e complexidade —
          sempre limitado a 10.
        </p>
        {exemplo && (
          <div className="bloco-calculo">
            <strong>{exemplo.titulo}</strong><br />
            peso {exemplo.peso ?? 5} × ({MULT_PRIORIDADE[exemplo.prioridade] ?? 1} + {MULT_VALOR[exemplo.valor] ?? 1}
            {' '}+ {exemplo.complexidade ? (MULT_COMPLEXIDADE[exemplo.complexidade] ?? 1) : 1}) ÷ 3
            {' '}= <strong>{pesoEfetivo(exemplo)}</strong>
          </div>
        )}

        <h3 className="secao">2 · Os quatro componentes deste recorte</h3>
        <p className="mudo" style={{ marginTop: 4 }}>
          Todos usam <strong>peso efetivo</strong> como moeda — nunca contagem de demandas.
          Abaixo, de onde vem cada número.
        </p>
        {n.componentes.map((comp) => (
          <div key={comp.nome} className="comp-calculo">
            <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
              <strong>{comp.nome}</strong>
              <div className="espaco" />
              <span className="mono mudo">peso {comp.peso}%</span>
              <span className="mono"><strong>{num(comp.valorExato)}</strong> pts</span>
            </div>
            <p className="mudo" style={{ margin: '4px 0 8px' }}>{comp.oQueMede}</p>
            <ul className="termos-calculo">
              {comp.termos.map((t) => (
                <li key={t.rotulo}>
                  <span className="mono termo-valor">{t.valor}</span>
                  <span><strong>{t.rotulo}</strong> — {t.origem}</span>
                </li>
              ))}
            </ul>
            <div className="bloco-calculo mono" style={{ marginTop: 8 }}>
              {comp.formula}
              <br />
              <span className="mudo">
                contribuição na nota: {num(comp.valorExato)} × {comp.peso}% ={' '}
                <strong>{num((comp.valorExato * comp.peso) / 100)}</strong> ponto(s)
              </span>
            </div>
          </div>
        ))}

        <div className="bloco-calculo" style={{ marginTop: 12 }}>
          <strong>Nota de {props.alvo}</strong> = soma das quatro contribuições
          <br />
          <span className="mono">
            {n.componentes.map((x) => num((x.valorExato * x.peso) / 100)).join(' + ')} = {num(soma)} → <strong>{n.nota}</strong>
          </span>
        </div>

        <h3 className="secao">3 · Base do cálculo</h3>
        <p className="mudo" style={{ marginTop: 4 }}>
          {n.concluidas} entrega(s) concluída(s) · peso médio {n.pesoMedio} · {n.pesoTotal} pontos de peso entregues.
          {n.amostraPequena && ' Menos de 5 entregas: leia a nota como indício, não como conclusão.'}
        </p>

        <h3 className="secao">4 · Faixas</h3>
        <p className="mudo" style={{ marginTop: 4 }}>
          90–100 Excelente · 75–89 Bom · 60–74 Atenção · abaixo de 60 Crítico.
          Leitura de desenvolvimento individual — nunca ranking público (Art. 42.10 da Constituição).
        </p>

        <div className="acoes">
          <button className="btn primario" onClick={props.onFechar}>Entendi</button>
        </div>
      </div>
    </div>
  );
}

/** Nota individual da entrega (0 quando ainda não concluída). */
function notaDemanda(d: Demanda): number {
  if (d.status !== 'concluida') return 0;
  return calcularNota([d]).nota ?? 0;
}

/** Exporta o recorte visível para .xlsx */
async function exportarTabela(linhas: Demanda[], anexos?: Map<string, number>) {
  const XLSX = await import('xlsx');
  const dados = linhas.map((d) => ({
    'Demanda': d.titulo,
    'Processo': d.processo?.nome ?? 'Avulsa',
    'Prioridade': PRIORIDADE[d.prioridade].rotulo,
    'Peso': pesoEfetivo(d),
    'Peso informado': d.peso ?? '',
    'Valor': VALOR[d.valor],
    'Tipo': TIPO_DEMANDA[d.tipo],
    'Prazo': fmtData(d.prazo),
    'Entrega': d.concluida_em ? fmtData(d.concluida_em) : '',
    'SLA': d.status === 'concluida'
      ? (d.motivo_conclusao ? MOTIVO_CONCLUSAO[d.motivo_conclusao] : '')
      : (demandaAtrasada(d) ? 'Atrasada' : 'Em dia'),
    'Nota': notaDemanda(d),
    'Retrabalho': d.retrabalho,
    'Responsável': d.responsavel?.nome ?? '',
    'Recorrente': d.recorrencia ? RECORRENCIA_DEMANDA[d.recorrencia] : 'Não',
    'Anexos': anexos?.get(d.id) ?? 0,
    'Status': STATUS_DEMANDA[d.status].rotulo,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), 'Demandas');
  XLSX.writeFile(wb, `desempenho-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
