// Vista Desempenho — SLA · Lead Time (dias e horas) · Retrabalho · Avaliação · Recorrência.
// Gráficos por mês, por processo e por tipo com MÉTRICA SELECIONÁVEL,
// seções colapsáveis com rolagem, e filtros completos (incl. intervalo personalizado).
import { useMemo, useState, type ReactNode } from 'react';
import { useDemandas } from '../../data/demandas.queries';
import { useAreas, usePessoaAtual, usePessoas, useProcessos } from '../../data/queries';
import { type Demanda, TIPO_DEMANDA, type TipoDemanda } from '../../domain/demandas';
import { fmtCompetencia } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import { MultiFiltro } from '../../components/MultiFiltro';

type Periodo = '30' | '90' | '365' | 'este_mes' | 'mes_passado' | 'este_ano' | 'tudo' | 'custom';
type Metrica = 'qtd' | 'lead' | 'sla' | 'aval';

const METRICAS: Record<Metrica, string> = {
  qtd: 'Quantidade', lead: 'Lead time (h)', sla: 'SLA %', aval: 'Avaliação média',
};

const estrelas = (n: number | null) => (n === null ? '—' : `${'★'.repeat(Math.round(n))} ${n.toFixed(1)}`);
const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function leadHoras(d: Demanda): number | null {
  if (!d.concluida_em) return null;
  return (new Date(d.concluida_em).getTime() - new Date(d.criado_em).getTime()) / 3600000;
}

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
  return { valor: v, display: `★ ${v.toFixed(1)}` };
}

function Secao(props: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  const [aberto, setAberto] = useState(true);
  return (
    <div className="cartao secao">
      <div className="linha" style={{ cursor: 'pointer' }} onClick={() => setAberto(!aberto)}
           role="button" tabIndex={0} aria-expanded={aberto}>
        <h3 style={{ margin: 0 }}>{props.titulo}</h3>
        {props.extra}
        <div className="espaco" />
        <span className="mudo">{aberto ? 'ocultar ▴' : 'mostrar ▾'}</span>
      </div>
      {aberto && <div className="scroll-box" style={{ marginTop: 12 }}>{props.children}</div>}
    </div>
  );
}

function Barras(props: { linhas: { rotulo: string; valor: number | null; display: string }[]; cor?: string }) {
  const max = Math.max(1, ...props.linhas.map((l) => l.valor ?? 0));
  if (props.linhas.length === 0) return <p className="suave">Sem dados no recorte.</p>;
  return (
    <div className="grade">
      {props.linhas.map((l) => (
        <div key={l.rotulo} className="linha">
          <span style={{ minWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={l.rotulo}>{l.rotulo}</span>
          <div className="barra-h" style={{ flex: 1 }}>
            <div style={{ width: `${((l.valor ?? 0) / max) * 100}%`,
                          background: props.cor ?? 'var(--cor-primaria)' }} />
          </div>
          <span className="mudo" style={{ minWidth: 70, textAlign: 'right' }}>{l.display}</span>
        </div>
      ))}
    </div>
  );
}

export function Desempenho() {
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

  const pessoaEfetiva = ehGestor ? pessoaF : (eu ? [eu.id] : []);

  const faixa = useMemo<[string | null, string | null]>(() => {
    const hoje = new Date();
    switch (periodo) {
      case '30': return [isoDia(new Date(Date.now() - 30 * 86400000)), null];
      case '90': return [isoDia(new Date(Date.now() - 90 * 86400000)), null];
      case '365': return [isoDia(new Date(Date.now() - 365 * 86400000)), null];
      case 'este_mes': return [isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), null];
      case 'mes_passado': return [
        isoDia(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
        isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 0))];
      case 'este_ano': return [`${hoje.getFullYear()}-01-01`, null];
      case 'custom': return [de || null, ate || null];
      default: return [null, null];
    }
  }, [periodo, de, ate]);

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
      return true;
    });
  }, [demandas, faixa, areaF, pessoaEfetiva, processoF, tipoF]);

  const concluidas = useMemo(() => base.filter((d) => d.status === 'concluida'), [base]);

  const cards = useMemo(() => {
    const noPrazo = concluidas.filter((d) =>
      d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada').length;
    const hs = concluidas.map(leadHoras).filter((x): x is number => x !== null);
    const leadH = hs.length ? Math.round(hs.reduce((a, b) => a + b, 0) / hs.length) : null;
    const avals = concluidas.filter((d) => d.avaliacao_nota !== null);
    return {
      total: concluidas.length,
      pctPrazo: concluidas.length ? Math.round((noPrazo / concluidas.length) * 100) : null,
      leadDias: leadH !== null ? Math.round((leadH / 24) * 10) / 10 : null,
      leadHoras: leadH,
      retrabalho: concluidas.reduce((s, d) => s + d.retrabalho, 0),
      notaMedia: avals.length
        ? Math.round((avals.reduce((s, d) => s + (d.avaliacao_nota ?? 0), 0) / avals.length) * 10) / 10 : null,
      pendentes: concluidas.length - avals.length,
      recorrentes: concluidas.filter((d) => d.recorrencia !== null).length,
    };
  }, [concluidas]);

  const porMes = useMemo(() => {
    const meses: { rotulo: string; valor: number | null; display: string }[] = [];
    const agora = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const doMes = concluidas.filter((x) => x.concluida_em?.startsWith(chave));
      if (doMes.length === 0 && i > 5) continue; // meses antigos vazios não poluem
      const m = metricaDe(doMes, metrica);
      meses.push({ rotulo: fmtCompetencia(chave), ...m });
    }
    return meses;
  }, [concluidas, metrica]);

  const porProcesso = useMemo(() => {
    const grupos = new Map<string, Demanda[]>();
    for (const d of concluidas) {
      const chave = d.processo?.nome ?? 'Avulsa';
      grupos.set(chave, [...(grupos.get(chave) ?? []), d]);
    }
    return [...grupos.entries()]
      .map(([rotulo, lista]) => ({ rotulo, ...metricaDe(lista, metrica) }))
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  }, [concluidas, metrica]);

  const porTipo = useMemo(() => {
    const grupos = new Map<string, Demanda[]>();
    for (const d of concluidas) {
      const chave = TIPO_DEMANDA[d.tipo];
      grupos.set(chave, [...(grupos.get(chave) ?? []), d]);
    }
    return [...grupos.entries()]
      .map(([rotulo, lista]) => ({ rotulo, ...metricaDe(lista, metrica) }))
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  }, [concluidas, metrica]);

  const porPessoa = useMemo(() => {
    const visiveis = ehGestor ? (pessoas ?? []) : (pessoas ?? []).filter((p) => p.id === eu?.id);
    return visiveis
      .map((p) => {
        const dela = concluidas.filter((d) => d.responsavel_id === p.id);
        const hs = dela.map(leadHoras).filter((x): x is number => x !== null);
        const avals = dela.filter((d) => d.avaliacao_nota !== null);
        return {
          pessoa: p,
          total: dela.length,
          pct: dela.length ? Math.round((dela.filter((d) =>
            d.motivo_conclusao === 'no_prazo' || d.motivo_conclusao === 'antecipada').length / dela.length) * 100) : null,
          leadH: hs.length ? Math.round(hs.reduce((a, b) => a + b, 0) / hs.length) : null,
          retrabalho: dela.reduce((s, d) => s + d.retrabalho, 0),
          nota: avals.length
            ? Math.round((avals.reduce((s, d) => s + (d.avaliacao_nota ?? 0), 0) / avals.length) * 10) / 10 : null,
          pendentes: dela.length - avals.length,
        };
      })
      .filter((x) => x.total > 0);
  }, [pessoas, concluidas, ehGestor, eu]);

  if (isLoading || !eu) return <Carregando linhas={5} />;

  return (
    <div style={{ maxWidth: 920 }}>
      {/* Filtros completos */}
      <div className="linha" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} style={{ maxWidth: 170 }}>
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
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={{ maxWidth: 160 }} />
            <span className="mudo">até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={{ maxWidth: 160 }} />
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
      </div>

      {/* Números do recorte */}
      <div className="grade secao" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <CardNum rotulo="Concluídas" valor={String(cards.total)} />
        <CardNum rotulo="SLA — % no prazo" valor={cards.pctPrazo === null ? '—' : `${cards.pctPrazo}%`}
                 critico={cards.pctPrazo !== null && cards.pctPrazo < 70} />
        <CardNum rotulo="Lead time (dias)" valor={cards.leadDias === null ? '—' : `${cards.leadDias}d`} />
        <CardNum rotulo="Lead time (horas)" valor={cards.leadHoras === null ? '—' : `${cards.leadHoras}h`} />
        <CardNum rotulo="Retrabalho" valor={String(cards.retrabalho)} critico={cards.retrabalho > 0} />
        <CardNum rotulo="Avaliação média" valor={estrelas(cards.notaMedia)} />
        <CardNum rotulo="Aguardando avaliação" valor={String(cards.pendentes)} critico={cards.pendentes > 0} />
        <CardNum rotulo="De recorrência" valor={String(cards.recorrentes)} />
      </div>

      {/* Métrica dos gráficos */}
      <div className="linha" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="mudo">Métrica dos gráficos:</span>
        {(Object.entries(METRICAS) as [Metrica, string][]).map(([k, v]) => (
          <button key={k} className={`btn mini ${metrica === k ? 'primario' : ''}`}
                  onClick={() => setMetrica(k)}>{v}</button>
        ))}
      </div>

      <Secao titulo={`Por mês — ${METRICAS[metrica]}`}>
        <Barras linhas={porMes} />
      </Secao>

      <Secao titulo={`Por processo — ${METRICAS[metrica]}`}>
        <Barras linhas={porProcesso} cor="var(--cor-saudavel)" />
      </Secao>

      <Secao titulo={`Por tipo — ${METRICAS[metrica]}`}>
        <Barras linhas={porTipo} cor="var(--cor-atencao)" />
      </Secao>

      <Secao titulo={ehGestor ? 'Desempenho por pessoa (visível a gestores)' : 'Meu desempenho'}>
        {porPessoa.length === 0 ? (
          <EstadoVazio titulo="Sem dados no recorte selecionado.">Ajuste os filtros ou o período.</EstadoVazio>
        ) : (
          <ul className="lista-limpa">
            {porPessoa.map((x) => (
              <li key={x.pessoa.id} className="linha"
                  style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)', flexWrap: 'wrap' }}>
                <strong style={{ minWidth: 160 }}>{x.pessoa.nome}</strong>
                <span className="suave">{x.total} concluída(s)</span>
                <span className="suave">· SLA {x.pct === null ? '—' : `${x.pct}%`}</span>
                <span className="suave">· lead {x.leadH === null ? '—' : `${x.leadH}h`}</span>
                <span className="suave">· retrabalho {x.retrabalho}</span>
                <div className="espaco" />
                <span className="suave">{estrelas(x.nota)}</span>
                {x.pendentes > 0 && <Badge tom="atencao">{x.pendentes} sem avaliação</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <p className="mudo">
        Leitura de desenvolvimento, nunca ranking (Art. 42.10). Colaborador vê os próprios números;
        gestores veem a equipe (Etapa 3 §2.4).
      </p>
    </div>
  );
}

function CardNum(props: { rotulo: string; valor: string; critico?: boolean }) {
  return (
    <div className="cartao" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 21, fontWeight: 700,
                    color: props.critico ? 'var(--cor-critico)' : 'var(--texto)' }}>
        {props.valor}
      </div>
      <div className="mudo">{props.rotulo}</div>
    </div>
  );
}
