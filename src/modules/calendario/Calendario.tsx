// Calendário — Diário (grade com resumo do dia) · Semanal (colunas estilo cronograma)
// · Mensal (consolidado) · Kanban (colunas por status). Filtros: vista, responsável,
// status e processo. Projeções ↻ das recorrências incluídas.
import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useDemandas } from '../../data/demandas.queries';
import { usePessoaAtual, usePessoas, useProcessos } from '../../data/queries';
import {
  type Demanda, type StatusDemanda, STATUS_DEMANDA, demandaAtrasada,
} from '../../domain/demandas';
import { fmtData } from '../../domain/regras';
import { Badge, Carregando } from '../../components/ui';
import { MultiFiltro } from '../../components/MultiFiltro';
import { CampoFiltro, PainelFiltros } from '../../components/PainelFiltros';

type Vista = 'meu' | 'equipe' | 'obrigacoes';
type Modo = 'grade' | 'semanas' | 'meses' | 'kanban';
interface Item { d: Demanda; projetada: boolean }

const VISTAS: { chave: Vista; rotulo: string }[] = [
  { chave: 'meu', rotulo: 'Meu' },
  { chave: 'equipe', rotulo: 'Equipe' },
  { chave: 'obrigacoes', rotulo: 'Obrigações' },
];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DIAS_SEMANA = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diaCurto = (isoD: string) => {
  const [, m, dd] = isoD.split('-').map(Number);
  return `${dd}/${MES_CURTO[m - 1]}`;
};

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

// Cor semântica da lateral do card (estilo cronograma)
function corItem(it: Item): string {
  if (it.projetada) return 'var(--cor-primaria-suave)';
  const d = it.d;
  if (['concluida'].includes(d.status)) return 'var(--cor-saudavel)';
  if (d.status === 'encerrada') return 'var(--texto-mudo)';
  if (demandaAtrasada(d) || d.status === 'bloqueada') return 'var(--cor-critico)';
  if (d.status === 'em_execucao' || d.status === 'em_validacao') return 'var(--cor-atencao)';
  return 'var(--cor-primaria)';
}
function classeItem(d: Demanda, projetada: boolean): string {
  if (projetada) return 'projetada';
  if (['concluida', 'encerrada'].includes(d.status)) return 'concluida';
  if (d.status === 'solicitada') return 'solicitada';
  if (demandaAtrasada(d)) return 'atrasada';
  return '';
}

// Card no estilo do cronograma: borda colorida · título · responsável · data + status
function CartaoCrono(props: { it: Item; onAbrir: () => void }) {
  const { it } = props;
  const d = it.d;
  const atras = !it.projetada && demandaAtrasada(d);
  return (
    <div className="k-card" style={{ borderLeftColor: corItem(it) }}
         onClick={(e) => { e.stopPropagation(); props.onAbrir(); }}
         role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && props.onAbrir()}>
      <strong style={{ display: 'block', fontSize: 13 }}>
        {it.projetada ? '↻ ' : ''}{d.titulo}
      </strong>
      <div className="mudo" style={{ marginTop: 3 }}>
        {d.responsavel?.nome ?? d.criador?.nome ?? '—'}
        {d.processo?.nome ? ` · ${d.processo.nome}` : ''}
      </div>
      <div className="linha" style={{ marginTop: 6 }}>
        <span className="mudo">{diaCurto(d.prazo)}</span>
        <div className="espaco" />
        {it.projetada ? (
          <Badge tom="info">prevista</Badge>
        ) : (
          <Badge tom={atras ? 'critico' : STATUS_DEMANDA[d.status].tom}>
            {atras ? 'Atrasada' : STATUS_DEMANDA[d.status].rotulo}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function Calendario() {
  const nav = useNavigate();
  const { vista = 'meu' } = useParams<{ vista: Vista }>();
  const { data: demandas, isLoading } = useDemandas();
  const { data: eu } = usePessoaAtual();
  const { data: pessoas } = usePessoas();
  const { data: processos } = useProcessos();

  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());
  const [modo, setModo] = useState<Modo>('grade');
  const [respFiltro, setRespFiltro] = useState<string[]>([]);
  const [statusFiltro, setStatusFiltro] = useState<string[]>([]);
  const [processoFiltro, setProcessoFiltro] = useState<string[]>([]);
  const [recFiltro, setRecFiltro] = useState('');
  const [situacoes, setSituacoes] = useState<Set<string>>(new Set());
  const alternarSituacao = (s: string) => setSituacoes((v) => {
    const n = new Set(v); if (n.has(s)) n.delete(s); else n.add(s); return n;
  });
  const situacaoDe = (d: Demanda): string =>
    ['concluida', 'encerrada'].includes(d.status) ? 'concluida'
      : d.status === 'solicitada' ? 'solicitada'
      : demandaAtrasada(d) ? 'atrasada' : 'andamento';
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const hojeIso = iso(agora);

  const alternar = (chave: string) => setExpandidos((s) => {
    const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n;
  });

  const filtradas = useMemo(() => {
    return (demandas ?? []).filter((d) => {
      if (d.status === 'rejeitada') return false;
      if (vista === 'meu' && d.responsavel_id !== eu?.id &&
          !(d.status === 'solicitada' && d.criador_id === eu?.id)) return false;
      if (vista === 'obrigacoes' && d.processo_id === null) return false;
      if (respFiltro.length > 0 && !respFiltro.includes(d.responsavel_id ?? '')) return false;
      if (statusFiltro.length > 0 && !statusFiltro.includes(d.status)) return false;
      if (processoFiltro.length > 0 && !processoFiltro.includes(d.processo_id ?? '__avulsa')) return false;
      if (recFiltro === 'sim' && d.recorrencia === null) return false;
      if (recFiltro === 'nao' && d.recorrencia !== null) return false;
      if (situacoes.size > 0 && !situacoes.has(situacaoDe(d))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandas, vista, eu, respFiltro, statusFiltro, processoFiltro, recFiltro, situacoes]);

  const itens = useMemo<Map<string, Item[]>>(() => {
    const fim = modo === 'meses' ? `${ano}-12-31` : iso(new Date(ano, mes + 1, 0));
    const mapa = new Map<string, Item[]>();
    const põe = (dia: string, it: Item) => mapa.set(dia, [...(mapa.get(dia) ?? []), it]);
    for (const d of filtradas) {
      põe(d.prazo, { d, projetada: false });
      if (d.recorrencia && !['concluida', 'encerrada'].includes(d.status)
          && (situacoes.size === 0 || situacoes.has('projetada'))) {
        let cur = d.prazo; let guarda = 0;
        while (guarda++ < 500) {
          cur = proximaData(cur, d.recorrencia);
          if (cur > fim) break;
          põe(cur, { d, projetada: true });
        }
      }
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, modo, ano, mes, situacoes]);

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

  // Kanban: colunas por status (somente demandas reais, sem projeções)
  const COLUNAS_KANBAN: { status: StatusDemanda; rotulo: string }[] = [
    { status: 'aberta', rotulo: 'A fazer' },
    { status: 'em_execucao', rotulo: 'Em andamento' },
    { status: 'bloqueada', rotulo: 'Bloqueadas' },
    { status: 'em_validacao', rotulo: 'Em validação' },
    { status: 'concluida', rotulo: 'Concluídas' },
  ];
  const kanban = useMemo(() => {
    return COLUNAS_KANBAN.map((c) => ({
      ...c,
      lista: filtradas
        .filter((d) => d.status === c.status)
        .sort((a, b) => (a.prazo < b.prazo ? -1 : 1)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas]);

  if (isLoading || !eu) return <Carregando linhas={5} />;

  const abrirDemanda = (d: Demanda) => nav(`/demandas/inbox/${d.id}`);
  const itensDoDia = diaAberto ? (itens.get(diaAberto) ?? []) : [];

  return (
    <>
      <div className="linha" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <h1>Calendário</h1>
        <div className="espaco" />
        {modo === 'meses' ? (
          <>
            <button className="btn mini" onClick={() => setAno(ano - 1)}>‹</button>
            <strong style={{ minWidth: 80, textAlign: 'center' }}>{ano}</strong>
            <button className="btn mini" onClick={() => setAno(ano + 1)}>›</button>
          </>
        ) : modo !== 'kanban' && (
          <>
            <button className="btn mini" onClick={() => { const d = new Date(ano, mes - 1, 1); setAno(d.getFullYear()); setMes(d.getMonth()); }}>‹</button>
            <strong style={{ minWidth: 150, textAlign: 'center' }}>{MESES[mes]} {ano}</strong>
            <button className="btn mini" onClick={() => { const d = new Date(ano, mes + 1, 1); setAno(d.getFullYear()); setMes(d.getMonth()); }}>›</button>
          </>
        )}
        {modo !== 'kanban' && (
          <button className="btn mini" onClick={() => { setAno(agora.getFullYear()); setMes(agora.getMonth()); }}>Hoje</button>
        )}
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
        {([['grade', 'Diário'], ['semanas', 'Semanal'], ['meses', 'Mensal'], ['kanban', 'Kanban']] as [Modo, string][]).map(([k, r]) => (
          <button key={k} className={`btn mini ${modo === k ? 'primario' : ''}`} onClick={() => setModo(k)}>{r}</button>
        ))}
        <PainelFiltros
          ativos={respFiltro.length + statusFiltro.length + processoFiltro.length + (recFiltro ? 1 : 0)}
          onLimpar={() => { setRespFiltro([]); setStatusFiltro([]); setProcessoFiltro([]); setRecFiltro(''); }}>
          <CampoFiltro rotulo="Responsáveis">
            <MultiFiltro rotulo="Responsáveis" selecionados={respFiltro} onChange={setRespFiltro}
              opcoes={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.nome }))} />
          </CampoFiltro>
          <CampoFiltro rotulo="Status">
            <MultiFiltro rotulo="Status" selecionados={statusFiltro} onChange={setStatusFiltro}
              opcoes={(Object.entries(STATUS_DEMANDA) as [StatusDemanda, { rotulo: string }][])
                .filter(([k]) => k !== 'rejeitada').map(([k, v]) => ({ id: k, nome: v.rotulo }))} />
          </CampoFiltro>
          <CampoFiltro rotulo="Processos">
            <MultiFiltro rotulo="Processos" selecionados={processoFiltro} onChange={setProcessoFiltro}
              opcoes={[...(processos ?? []).map((p) => ({ id: p.id, nome: p.nome })),
                       { id: '__avulsa', nome: 'Avulsas (sem processo)' }]} />
          </CampoFiltro>
          <CampoFiltro rotulo="Recorrência">
            <select value={recFiltro} onChange={(e) => setRecFiltro(e.target.value)}>
              <option value="">Todas</option>
              <option value="sim">Somente recorrentes</option>
              <option value="nao">Somente não recorrentes</option>
            </select>
          </CampoFiltro>
        </PainelFiltros>
      </div>

      <div className="linha" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="mudo">Legenda (clique para filtrar):</span>
        {([['andamento', 'Em andamento', ''], ['atrasada', 'Atrasada', 'atrasada'],
           ['concluida', 'Concluída', 'concluida'], ['solicitada', 'Solicitação', 'solicitada'],
           ['projetada', '↻ Prevista', 'projetada']] as [string, string, string][]).map(([chave, rotulo, classe]) => (
          <button key={chave} className={`cal-item ${classe} ${situacoes.has(chave) ? 'leg-ativa' : ''}`}
                  style={{ marginTop: 0, border: 'none' }}
                  onClick={() => alternarSituacao(chave)}>
            {rotulo}{situacoes.has(chave) ? ' ✕' : ''}
          </button>
        ))}
        {situacoes.size > 0 && (
          <button className="btn mini" onClick={() => setSituacoes(new Set())}>Limpar</button>
        )}
      </div>

      {/* ===== DIÁRIO: clique no dia abre o resumo ===== */}
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
                <div key={c.iso}
                     className={`cal-dia ${c.doMes ? '' : 'fora'} ${c.iso === hojeIso ? 'hoje' : ''}`}
                     style={{ cursor: doDia.length > 0 ? 'pointer' : 'default' }}
                     onClick={() => doDia.length > 0 && setDiaAberto(c.iso)}
                     role="button" tabIndex={0}
                     title={doDia.length > 0 ? 'Ver resumo do dia' : undefined}>
                  <div className="mudo" style={{ fontWeight: c.iso === hojeIso ? 700 : 400 }}>{c.dia}</div>
                  {doDia.slice(0, 3).map((it, i) => (
                    <div key={it.d.id + String(i)}
                         className={`cal-item ${classeItem(it.d, it.projetada)}`}
                         title={it.d.titulo}
                         onClick={(e) => { e.stopPropagation(); abrirDemanda(it.d); }}>
                      {it.projetada ? '↻ ' : ''}{it.d.titulo}
                    </div>
                  ))}
                  {doDia.length > 3 && <div className="mudo" style={{ fontSize: 11, marginTop: 2 }}>+{doDia.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== SEMANAL: colunas estilo cronograma ===== */}
      {modo === 'semanas' && (
        <div className="sem-quadro" style={{ gridTemplateColumns: `repeat(${semanas.length}, minmax(230px, 1fr))` }}>
          {semanas.map((s) => {
            const contemHoje = hojeIso >= s.de && hojeIso <= s.ate;
            return (
              <div key={s.rotulo} className={`sem-coluna ${contemHoje ? 'atual' : ''}`}>
                <div className="sem-cab">
                  <strong>{s.rotulo}</strong>
                  <div style={{ fontSize: 11.5, opacity: 0.85 }}>{diaCurto(s.de)} – {diaCurto(s.ate)}</div>
                </div>
                <div className="sem-corpo scroll-box" style={{ maxHeight: 520 }}>
                  {s.lista.length === 0 ? (
                    <p className="mudo" style={{ padding: 8 }}>—</p>
                  ) : s.lista.map((it, i) => (
                    <CartaoCrono key={it.d.id + String(i)} it={it} onAbrir={() => abrirDemanda(it.d)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== MENSAL: consolidado expansível ===== */}
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
                            onClick={() => abrirDemanda(it.d)}>
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

      {/* ===== KANBAN: colunas por status ===== */}
      {modo === 'kanban' && (
        <div className="sem-quadro" style={{ gridTemplateColumns: `repeat(${kanban.length}, minmax(240px, 1fr))` }}>
          {kanban.map((col) => (
            <div key={col.status} className="sem-coluna">
              <div className="sem-cab linha">
                <strong>{col.rotulo}</strong>
                <div className="espaco" />
                <span style={{ opacity: 0.85 }}>{col.lista.length}</span>
              </div>
              <div className="sem-corpo scroll-box" style={{ maxHeight: 560 }}>
                {col.lista.length === 0 ? (
                  <p className="mudo" style={{ padding: 8 }}>—</p>
                ) : col.lista.map((d) => (
                  <CartaoCrono key={d.id} it={{ d, projetada: false }} onAbrir={() => abrirDemanda(d)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== RESUMO DO DIA (drawer local) ===== */}
      {diaAberto && (
        <>
          <div className="drawer-fundo" onClick={() => setDiaAberto(null)} />
          <aside className="drawer" style={{ width: 'min(520px, 92vw)' }} aria-label="Resumo do dia">
            <header className="drawer-cabecalho" style={{ paddingBottom: 14 }}>
              <div className="linha">
                <h1>{fmtData(diaAberto)}</h1>
                <Badge tom="info">{itensDoDia.length} item(ns)</Badge>
                <div className="espaco" />
                <button className="btn mini" onClick={() => setDiaAberto(null)}>✕ Fechar</button>
              </div>
              <p className="mudo" style={{ marginTop: 4 }}>
                {new Date(diaAberto + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
              </p>
            </header>
            <div className="drawer-corpo">
              <div className="grade">
                {itensDoDia.map((it, i) => (
                  <CartaoCrono key={it.d.id + String(i)} it={it}
                    onAbrir={() => { setDiaAberto(null); abrirDemanda(it.d); }} />
                ))}
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
