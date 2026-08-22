// Gantt dos Processos — linhas agrupadas (processo → demandas), caixa separada
// para Avulsas, escala Diária/Semanal/Mensal e legenda de situação.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Demanda, demandaAtrasada } from '../../domain/demandas';
import { fmtData } from '../../domain/regras';
import { Badge, EstadoVazio } from '../../components/ui';
import type { Processo } from '../../domain/tipos';

type Escala = 'dia' | 'semana' | 'mes';

const MES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dias = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 86400e3);

function situacao(d: Demanda): { chave: string; rotulo: string; cor: string } {
  if (d.status === 'concluida') return { chave: 'concluida', rotulo: 'Concluído', cor: 'var(--cor-saudavel)' };
  if (d.status === 'encerrada') return { chave: 'encerrada', rotulo: 'Encerrada', cor: 'var(--texto-mudo)' };
  if (demandaAtrasada(d)) return { chave: 'pendente', rotulo: 'Pendente (prazo expirado)', cor: 'var(--cor-critico)' };
  if (d.status === 'bloqueada') return { chave: 'bloqueada', rotulo: 'Bloqueada', cor: '#8b3a2f' };
  if (d.status === 'em_execucao' || d.status === 'em_validacao')
    return { chave: 'andamento', rotulo: 'Em andamento', cor: 'var(--cor-atencao)' };
  return { chave: 'afazer', rotulo: 'A fazer', cor: 'var(--cor-primaria)' };
}

// Janela da barra: do início (criação/execução) até o prazo (ou entrega)
function janela(d: Demanda): [string, string] {
  const fim = (d.concluida_em ?? '').slice(0, 10) || d.prazo;
  const criado = d.criado_em.slice(0, 10);
  const ini = criado < d.prazo ? criado : d.prazo;
  return [ini, fim > ini ? fim : ini];
}

export function Gantt(props: { demandas: Demanda[]; processos: Processo[] }) {
  const nav = useNavigate();
  const [escala, setEscala] = useState<Escala>('semana');
  const [abertos, setAbertos] = useState<Set<string>>(new Set(['__avulsa']));
  const hoje = iso(new Date());

  const alternar = (id: string) => setAbertos((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  // Horizonte: menor início × maior fim das demandas visíveis (com folga)
  const [inicio, fim] = useMemo<[string, string]>(() => {
    if (props.demandas.length === 0) return [hoje, hoje];
    let min = '9999-12-31'; let max = '0000-01-01';
    for (const d of props.demandas) {
      const [a, b] = janela(d);
      if (a < min) min = a;
      if (b > max) max = b;
    }
    const dIni = new Date(min + 'T12:00:00Z'); dIni.setUTCDate(dIni.getUTCDate() - 2);
    const dFim = new Date(max + 'T12:00:00Z'); dFim.setUTCDate(dFim.getUTCDate() + 2);
    return [iso(dIni), iso(dFim)];
  }, [props.demandas, hoje]);

  const totalDias = Math.max(1, dias(inicio, fim) + 1);
  const pctDe = (d: string) => (dias(inicio, d) / totalDias) * 100;
  const larguraDe = (a: string, b: string) => Math.max(1.2, ((dias(a, b) + 1) / totalDias) * 100);

  // Cabeçalho da escala
  const colunas = useMemo(() => {
    const out: { rotulo: string; esquerda: number; largura: number; forte: boolean }[] = [];
    const cur = new Date(inicio + 'T12:00:00Z');
    const dFim = new Date(fim + 'T12:00:00Z');
    if (escala === 'dia') {
      while (cur <= dFim) {
        const d = iso(cur);
        out.push({ rotulo: String(cur.getUTCDate()), esquerda: pctDe(d), largura: 100 / totalDias,
                   forte: cur.getUTCDay() === 1 });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else if (escala === 'semana') {
      // alinha na segunda-feira
      cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() + 6) % 7));
      while (cur <= dFim) {
        const d = iso(cur);
        const prox = new Date(cur); prox.setUTCDate(prox.getUTCDate() + 6);
        out.push({ rotulo: `${cur.getUTCDate()}/${MES_CURTO[cur.getUTCMonth()]}`,
                   esquerda: pctDe(d), largura: (7 / totalDias) * 100, forte: true });
        cur.setUTCDate(cur.getUTCDate() + 7);
      }
    } else {
      cur.setUTCDate(1);
      while (cur <= dFim) {
        const d = iso(cur);
        const ultimo = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
        out.push({ rotulo: `${MES_CURTO[cur.getUTCMonth()]}/${String(cur.getUTCFullYear()).slice(2)}`,
                   esquerda: pctDe(d), largura: (ultimo.getUTCDate() / totalDias) * 100, forte: true });
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, escala, totalDias]);

  // Grupos: processos com demandas + caixa de avulsas
  const grupos = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string; itens: Demanda[] }>();
    for (const d of props.demandas) {
      const id = d.processo_id ?? '__avulsa';
      const nome = d.processo_id
        ? (d.processo?.nome ?? props.processos.find((p) => p.id === d.processo_id)?.nome ?? 'Processo')
        : 'Demandas avulsas';
      const g = mapa.get(id) ?? { id, nome, itens: [] };
      g.itens.push(d);
      mapa.set(id, g);
    }
    const lista = [...mapa.values()].map((g) => ({
      ...g,
      itens: g.itens.sort((a, b) => (janela(a)[0] < janela(b)[0] ? -1 : 1)),
      atrasadas: g.itens.filter(demandaAtrasada).length,
    }));
    // avulsas sempre no fim
    return lista.sort((a, b) =>
      a.id === '__avulsa' ? 1 : b.id === '__avulsa' ? -1 : b.itens.length - a.itens.length);
  }, [props.demandas, props.processos]);

  const LEGENDA = [
    { rotulo: 'Concluído', cor: 'var(--cor-saudavel)' },
    { rotulo: 'Em andamento', cor: 'var(--cor-atencao)' },
    { rotulo: 'A fazer', cor: 'var(--cor-primaria)' },
    { rotulo: 'Pendente (prazo expirado)', cor: 'var(--cor-critico)' },
    { rotulo: 'Bloqueada', cor: '#8b3a2f' },
  ];

  if (props.demandas.length === 0) {
    return <EstadoVazio titulo="Nada no recorte para desenhar a linha do tempo.">Ajuste os filtros.</EstadoVazio>;
  }

  return (
    <div>
      <div className="linha" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="mudo">Escala:</span>
        {([['dia', 'Diária'], ['semana', 'Semanal'], ['mes', 'Mensal']] as [Escala, string][]).map(([k, r]) => (
          <button key={k} className={`btn mini ${escala === k ? 'primario' : ''}`}
                  onClick={() => setEscala(k)}>{r}</button>
        ))}
        <div className="espaco" />
        {LEGENDA.map((l) => (
          <span key={l.rotulo} className="linha" style={{ gap: 5, fontSize: 12 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: l.cor }} />
            <span className="mudo">{l.rotulo}</span>
          </span>
        ))}
      </div>

      <div className="cartao" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="gantt-rolagem">
          <div style={{ minWidth: escala === 'dia' ? Math.max(900, totalDias * 26) : 900 }}>
            {/* Cabeçalho temporal */}
            <div className="gantt-linha gantt-cab">
              <div className="gantt-rotulo"><strong>Processo / Demanda</strong></div>
              <div className="gantt-trilha">
                {colunas.map((c, i) => (
                  <div key={i} className="gantt-col-cab"
                       style={{ left: `${c.esquerda}%`, width: `${c.largura}%` }}>
                    {c.rotulo}
                  </div>
                ))}
              </div>
            </div>

            {grupos.map((g) => {
              const aberto = abertos.has(g.id);
              const gIni = g.itens.reduce((m, d) => (janela(d)[0] < m ? janela(d)[0] : m), '9999-12-31');
              const gFim = g.itens.reduce((m, d) => (janela(d)[1] > m ? janela(d)[1] : m), '0000-01-01');
              const avulsa = g.id === '__avulsa';
              return (
                <div key={g.id}>
                  {/* Linha do grupo (drilldown) */}
                  <div className={`gantt-linha gantt-grupo ${avulsa ? 'avulsa' : ''}`}
                       onClick={() => alternar(g.id)} role="button" tabIndex={0}>
                    <div className="gantt-rotulo">
                      <span style={{ marginRight: 6 }}>{aberto ? '▾' : '▸'}</span>
                      <strong>{avulsa ? '📦 ' : ''}{g.nome}</strong>
                      <span className="mudo" style={{ marginLeft: 6 }}>({g.itens.length})</span>
                      {g.atrasadas > 0 && <Badge tom="critico">{g.atrasadas}</Badge>}
                    </div>
                    <div className="gantt-trilha">
                      <div className="gantt-barra-grupo"
                           style={{ left: `${pctDe(gIni)}%`, width: `${larguraDe(gIni, gFim)}%` }} />
                      <div className="gantt-hoje" style={{ left: `${pctDe(hoje)}%` }} />
                    </div>
                  </div>

                  {/* Demandas do grupo */}
                  {aberto && g.itens.map((d) => {
                    const [a, b] = janela(d);
                    const s = situacao(d);
                    return (
                      <div key={d.id} className="gantt-linha gantt-item"
                           onClick={() => nav(`/demandas/inbox/${d.id}`)} role="button" tabIndex={0}
                           title={`${d.titulo} · ${d.responsavel?.nome ?? ''} · prazo ${fmtData(d.prazo)}`}>
                        <div className="gantt-rotulo">
                          <span className="gantt-corta">{d.titulo}</span>
                          <span className="mudo" style={{ marginLeft: 6, fontSize: 11 }}>
                            {d.responsavel?.nome?.split(' ')[0] ?? ''}
                          </span>
                        </div>
                        <div className="gantt-trilha">
                          <div className="gantt-barra"
                               style={{ left: `${pctDe(a)}%`, width: `${larguraDe(a, b)}%`, background: s.cor }}>
                            <span className="gantt-barra-texto">{fmtData(d.prazo)}</span>
                          </div>
                          <div className="gantt-hoje" style={{ left: `${pctDe(hoje)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mudo" style={{ marginTop: 8 }}>
        Barra = da criação ao prazo (ou entrega). A linha vertical marca hoje. Clique na demanda para abri-la.
      </p>
    </div>
  );
}
