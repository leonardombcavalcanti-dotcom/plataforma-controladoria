// Calendário — gerado dos prazos das demandas + PROJEÇÃO das recorrências.
// Modos: Diário (grade) · Semanal · Mensal (consolidado) · filtros de responsável e status · legenda.
import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useDemandas } from '../../data/demandas.queries';
import { usePessoaAtual, usePessoas } from '../../data/queries';
import { type Demanda, type StatusDemanda, STATUS_DEMANDA, demandaAtrasada } from '../../domain/demandas';
import { fmtData } from '../../domain/regras';
import { Badge, Carregando } from '../../components/ui';

type Vista = 'meu' | 'equipe' | 'obrigacoes';
type Modo = 'grade' | 'semanas' | 'meses';
interface Item { d: Demanda; projetada: boolean }

const VISTAS: { chave: Vista; rotulo: string }[] = [
  { chave: 'meu', rotulo: 'Meu' },
  { chave: 'equipe', rotulo: 'Equipe' },
  { chave: 'obrigacoes', rotulo: 'Obrigações' },
];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function proximaData(atual: string, rec: 'diaria' | 'semanal' | 'mensal' | 'anual'): string {
  const [y, m, dd] = atual.split('-').map(Number);
  const b = new Date(y, m - 1, dd);
  if (rec === 'diaria') {
    do { b.setDate(b.getDate() + 1); } while (b.getDay() === 0 || b.getDay() === 6);
  } else if (rec === 'semanal') b.setDate(b.getDate() + 7);
  else if (rec === 'mensal') b.setMonth(b.getMonth() + 1);
  else b.setFullYear(b.getFullYear() + 1);
  return iso(b);
}

function classeItem(d: Demanda, projetada: boolean): string {
  if (projetada) return 'projetada';
  if (['concluida', 'encerrada'].includes(d.status)) return 'concluida';
  if (d.status === 'solicitada') return 'solicitada';
  if (demandaAtrasada(d)) return 'atrasada';
  return '';
}

export function Calendario() {
  const nav = useNavigate();
  const { vista = 'meu' } = useParams<{ vista: Vista }>();
  const { data: demandas, isLoading } = useDemandas();
  const { data: eu } = usePessoaAtual();
  const { data: pessoas } = usePessoas();

  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());
  const [modo, setModo] = useState<Modo>('grade');
  const [respFiltro, setRespFiltro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const alternar = (chave: string) => setExpandidos((s) => {
    const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n;
  });
  const hojeIso = iso(agora);

  const filtradas = useMemo(() => {
    return (demandas ?? []).filter((d) => {
      if (d.status === 'rejeitada') return false;
      if (vista === 'meu' && d.responsavel_id !== eu?.id &&
          !(d.status === 'solicitada' && d.criador_id === eu?.id)) return false;
      if (vista === 'obrigacoes' && d.processo_id === null) return false;
      if (respFiltro && d.responsavel_id !== respFiltro) return false;
      if (statusFiltro && d.status !== statusFiltro) return false;
      return true;
    });
  }, [demandas, vista, eu, respFiltro, statusFiltro]);

  // Recorrência PROJETADA no horizonte visível (mês corrente ou ano inteiro)
  const itens = useMemo<Map<string, Item[]>>(() => {
    const fim = modo === 'meses' ? `${ano}-12-31` : iso(new Date(ano, mes + 1, 0));
    const mapa = new Map<string, Item[]>();
    const põe = (dia: string, it: Item) => mapa.set(dia, [...(mapa.get(dia) ?? []), it]);
    for (const d of filtradas) {
      põe(d.prazo, { d, projetada: false });
      if (d.recorrencia && !['concluida', 'encerrada'].includes(d.status)) {
        let cur = d.prazo; let guarda = 0;
        while (guarda++ < 500) {
          cur = proximaData(cur, d.recorrencia);
          if (cur > fim) break;
          põe(cur, { d, projetada: true });
        }
      }
    }
    return mapa;
  }, [filtradas, modo, ano, mes]);

  const grade = useMemo(() => {
    const primeiro = new Date(ano, mes, 1);
    const inicio = new Date(primeiro);
    inicio.setDate(primeiro.getDate() - ((primeiro.getDay() + 6) % 7));
    const celulas: { iso: string; dia: number; doMes: boolean }[] = [];
    const cursor = new Date(inicio);
    for (let i = 0; i < 42; i++) {
      celulas.push({ iso: iso(cursor), dia: cursor.getDate(), doMes: cursor.getMonth() === mes });
      cursor.setDate(cursor.getDate() + 1);
    }
    return celulas;
  }, [ano, mes]);

  const semanas = useMemo(() => {
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const grupos: { rotulo: string; de: string; ate: string; lista: Item[] }[] = [];
    let inicio = 1; let n = 1;
    while (inicio <= ultimoDia) {
      const dIni = new Date(ano, mes, inicio);
      const fim = Math.min(inicio + (6 - ((dIni.getDay() + 6) % 7)), ultimoDia);
      const deIso = iso(new Date(ano, mes, inicio));
      const ateIso = iso(new Date(ano, mes, fim));
      const lista: Item[] = [];
      for (const [dia, its] of itens) {
        if (dia >= deIso && dia <= ateIso) lista.push(...its);
      }
      lista.sort((a, b) => (a.d.prazo < b.d.prazo ? -1 : 1));
      grupos.push({ rotulo: `Semana ${n}`, de: deIso, ate: ateIso, lista });
      inicio = fim + 1; n++;
    }
    return grupos;
  }, [ano, mes, itens]);

  const meses = useMemo(() => {
    return MESES.map((nome, m) => {
      const prefixo = `${ano}-${String(m + 1).padStart(2, '0')}`;
      let total = 0, concluidas = 0, atrasadas = 0, previstas = 0;
      for (const [dia, its] of itens) {
        if (!dia.startsWith(prefixo)) continue;
        for (const it of its) {
          if (it.projetada) { previstas++; continue; }
          total++;
          if (['concluida', 'encerrada'].includes(it.d.status)) concluidas++;
          if (demandaAtrasada(it.d)) atrasadas++;
        }
      }
      return { nome, m, total, concluidas, atrasadas, previstas };
    });
  }, [ano, itens]);

  if (isLoading || !eu) return <Carregando linhas={5} />;

  const ItemCal = (p: { it: Item }) => (
    <div className={`cal-item ${classeItem(p.it.d, p.it.projetada)}`}
         title={`${p.it.d.titulo} — ${p.it.d.responsavel?.nome ?? p.it.d.criador?.nome ?? ''}${p.it.projetada ? ' (recorrência prevista)' : ''}`}
         onClick={() => nav(`/demandas/inbox/${p.it.d.id}`)}>
      {p.it.projetada ? '↻ ' : ''}{p.it.d.titulo}
    </div>
  );

  return (
    <>
      <div className="linha" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <h1>Calendário</h1>
        <div className="espaco" />
        {modo !== 'meses' ? (
          <>
            <button className="btn mini" onClick={() => { const d = new Date(ano, mes - 1, 1); setAno(d.getFullYear()); setMes(d.getMonth()); }}>‹</button>
            <strong style={{ minWidth: 150, textAlign: 'center' }}>{MESES[mes]} {ano}</strong>
            <button className="btn mini" onClick={() => { const d = new Date(ano, mes + 1, 1); setAno(d.getFullYear()); setMes(d.getMonth()); }}>›</button>
          </>
        ) : (
          <>
            <button className="btn mini" onClick={() => setAno(ano - 1)}>‹</button>
            <strong style={{ minWidth: 80, textAlign: 'center' }}>{ano}</strong>
            <button className="btn mini" onClick={() => setAno(ano + 1)}>›</button>
          </>
        )}
        <button className="btn mini" onClick={() => { setAno(agora.getFullYear()); setMes(agora.getMonth()); }}>Hoje</button>
      </div>

      <div className="linha" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <nav className="abas" style={{ marginTop: 0 }} aria-label="Vistas do calendário">
          {VISTAS.map((v) => (
            <NavLink key={v.chave} to={`/calendario/${v.chave}`}
              className={({ isActive }) => `aba ${isActive ? 'ativa' : ''}`}>
              {v.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="espaco" />
        {([['grade', 'Diário'], ['semanas', 'Semanal'], ['meses', 'Mensal']] as [Modo, string][]).map(([k, r]) => (
          <button key={k} className={`btn mini ${modo === k ? 'primario' : ''}`} onClick={() => setModo(k)}>{r}</button>
        ))}
        <select value={respFiltro} onChange={(e) => setRespFiltro(e.target.value)} style={{ maxWidth: 190 }}>
          <option value="">Todos os responsáveis</option>
          {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">Todos os status</option>
          {(Object.entries(STATUS_DEMANDA) as [StatusDemanda, { rotulo: string }][])
            .filter(([k]) => k !== 'rejeitada')
            .map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
      </div>

      {/* Legenda de cores */}
      <div className="linha" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="mudo">Legenda:</span>
        <span className="cal-item" style={{ marginTop: 0 }}>Em andamento</span>
        <span className="cal-item atrasada" style={{ marginTop: 0 }}>Atrasada</span>
        <span className="cal-item concluida" style={{ marginTop: 0 }}>Concluída</span>
        <span className="cal-item solicitada" style={{ marginTop: 0 }}>Solicitação</span>
        <span className="cal-item projetada" style={{ marginTop: 0 }}>↻ Recorrência prevista</span>
      </div>

      {modo === 'grade' && (
        <>
          <div className="cal-grade" style={{ marginBottom: 6 }}>
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="mudo" style={{ textAlign: 'center', fontWeight: 600 }}>{d}</div>
            ))}
          </div>
          <div className="cal-grade">
            {grade.map((c) => {
              const doDia = itens.get(c.iso) ?? [];
              return (
                <div key={c.iso} className={`cal-dia ${c.doMes ? '' : 'fora'} ${c.iso === hojeIso ? 'hoje' : ''}`}>
                  <div className="mudo" style={{ fontWeight: c.iso === hojeIso ? 700 : 400 }}>{c.dia}</div>
                  {doDia.slice(0, 3).map((it, i) => <ItemCal key={it.d.id + String(i)} it={it} />)}
                  {doDia.length > 3 && <div className="mudo" style={{ fontSize: 11, marginTop: 2 }}>+{doDia.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {modo === 'semanas' && (
        <div className="grade">
          {semanas.map((s) => {
            const chave = `sem-${s.rotulo}`;
            const contemHoje = hojeIso >= s.de && hojeIso <= s.ate;
            // Padrão: a semana de hoje abre; o clique inverte o estado padrão.
            const mostrar = expandidos.has(chave) ? !contemHoje : contemHoje;
            return (
            <div key={s.rotulo} className="cartao">
              <div className="linha" style={{ cursor: 'pointer' }} onClick={() => alternar(chave)}
                   role="button" tabIndex={0} aria-expanded={mostrar}>
                <strong>{s.rotulo}</strong>
                <span className="mudo">{fmtData(s.de)} – {fmtData(s.ate)}</span>
                <div className="espaco" />
                <Badge tom={s.lista.length === 0 ? 'neutro' : 'info'}>{s.lista.length}</Badge>
                <span className="mudo">{mostrar ? '▴' : '▾'}</span>
              </div>
              {mostrar && s.lista.length > 0 && (
                <ul className="lista-limpa scroll-box" style={{ marginTop: 8 }}>
                  {s.lista.map((it, i) => (
                    <li key={it.d.id + String(i)} className="linha"
                        style={{ padding: '5px 0', borderBottom: '1px solid var(--borda)', cursor: 'pointer' }}
                        onClick={() => nav(`/demandas/inbox/${it.d.id}`)}>
                      <span>{it.projetada ? '↻ ' : ''}{it.d.titulo}</span>
                      {!it.projetada && (
                        <Badge tom={STATUS_DEMANDA[it.d.status].tom}>{STATUS_DEMANDA[it.d.status].rotulo}</Badge>
                      )}
                      {it.projetada && <span className="mudo">recorrência prevista</span>}
                      <div className="espaco" />
                      <span className="mudo">{it.d.responsavel?.nome ?? ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ); })}
        </div>
      )}

      {modo === 'meses' && (
        <div className="grade">
          {meses.map((m) => {
            const chave = `mes-${m.m}`;
            const aberto = expandidos.has(chave);
            const prefixo = `${ano}-${String(m.m + 1).padStart(2, '0')}`;
            const doMes: { dia: string; it: Item }[] = [];
            if (aberto) {
              for (const [dia, its] of itens) {
                if (dia.startsWith(prefixo)) for (const it of its) doMes.push({ dia, it });
              }
              doMes.sort((a, b) => (a.dia < b.dia ? -1 : 1));
            }
            return (
              <div key={m.m} className="cartao">
                <div className="linha" style={{ cursor: 'pointer' }} onClick={() => alternar(chave)}
                     role="button" tabIndex={0} aria-expanded={aberto}>
                  <strong>{m.nome}</strong>
                  <span className="mudo">
                    {m.concluidas} concluída(s)
                    {m.atrasadas > 0 ? ` · ${m.atrasadas} atrasada(s)` : ''}
                    {m.previstas > 0 ? ` · ↻ ${m.previstas} prevista(s)` : ''}
                  </span>
                  <div className="espaco" />
                  <Badge tom={m.total === 0 ? 'neutro' : 'info'}>{m.total}</Badge>
                  <button className="btn mini" onClick={(e) => { e.stopPropagation(); setMes(m.m); setModo('grade'); }}>
                    Ver no diário
                  </button>
                  <span className="mudo">{aberto ? '▴' : '▾'}</span>
                </div>
                {aberto && (
                  doMes.length === 0 ? (
                    <p className="mudo" style={{ marginTop: 8 }}>Nada neste mês com os filtros atuais.</p>
                  ) : (
                    <ul className="lista-limpa scroll-box" style={{ marginTop: 8 }}>
                      {doMes.map(({ dia, it }, i) => (
                        <li key={it.d.id + dia + String(i)} className="linha"
                            style={{ padding: '5px 0', borderBottom: '1px solid var(--borda)', cursor: 'pointer' }}
                            onClick={() => nav(`/demandas/inbox/${it.d.id}`)}>
                          <span className="mudo" style={{ minWidth: 78 }}>{fmtData(dia)}</span>
                          <span>{it.projetada ? '↻ ' : ''}{it.d.titulo}</span>
                          {!it.projetada && (
                            <Badge tom={STATUS_DEMANDA[it.d.status].tom}>{STATUS_DEMANDA[it.d.status].rotulo}</Badge>
                          )}
                          <div className="espaco" />
                          <span className="mudo">{it.d.responsavel?.nome ?? ''}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
