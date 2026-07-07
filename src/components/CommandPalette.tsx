// Ctrl+K — busca universal (Etapa 4.75 P6): objetos, pessoas e ações.
// É o resgate universal do P7: de qualquer lugar, para qualquer lugar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemandas } from '../data/demandas.queries';
import { usePessoas, useProcessos } from '../data/queries';
import { STATUS_DEMANDA } from '../domain/demandas';
import { STATUS_PROCESSO } from '../domain/regras';

interface Resultado {
  id: string;
  grupo: 'Ações' | 'Demandas' | 'Processos' | 'Pessoas';
  rotulo: string;
  detalhe?: string;
  executar: () => void;
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function CommandPalette(props: { aberta: boolean; onFechar: () => void }) {
  const nav = useNavigate();
  const { data: demandas } = useDemandas();
  const { data: processos } = useProcessos();
  const { data: pessoas } = usePessoas();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.aberta) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [props.aberta]);

  const resultados = useMemo<Resultado[]>(() => {
    const ir = (rota: string) => () => { props.onFechar(); nav(rota); };
    const nq = normalizar(q.trim());
    const bate = (texto: string) => nq === '' || normalizar(texto).includes(nq);

    const acoes: Resultado[] = ([
      { id: 'a1', grupo: 'Ações', rotulo: 'Nova demanda', executar: ir('/demandas/nova') },
      { id: 'a2', grupo: 'Ações', rotulo: 'Nova solicitação', executar: ir('/demandas/solicitar') },
      { id: 'a3', grupo: 'Ações', rotulo: 'Novo processo', executar: ir('/processos/novo') },
      { id: 'a4', grupo: 'Ações', rotulo: 'Ir para Central de Trabalho', executar: ir('/central') },
      { id: 'a5', grupo: 'Ações', rotulo: 'Ir para Inbox de demandas', executar: ir('/demandas/inbox') },
      { id: 'a6', grupo: 'Ações', rotulo: 'Ir para Solicitações', executar: ir('/demandas/solicitacoes') },
      { id: 'a7', grupo: 'Ações', rotulo: 'Ir para Biblioteca de processos', executar: ir('/processos') },
      { id: 'a8', grupo: 'Ações', rotulo: 'Ir para Capacidade da equipe', executar: ir('/equipe/capacidade') },
      { id: 'a9', grupo: 'Ações', rotulo: 'Ir para Calendário', executar: ir('/calendario/meu') },
    ] as Resultado[]).filter((a) => bate(a.rotulo));

    const ds: Resultado[] = (demandas ?? [])
      .filter((d) => bate(d.titulo))
      .slice(0, 6)
      .map((d) => ({
        id: `d${d.id}`, grupo: 'Demandas', rotulo: d.titulo,
        detalhe: `${STATUS_DEMANDA[d.status].rotulo} · ${d.responsavel?.nome ?? d.criador?.nome ?? ''}`,
        executar: ir(`/demandas/inbox/${d.id}`),
      }));

    const ps: Resultado[] = (processos ?? [])
      .filter((p) => bate(p.nome))
      .slice(0, 4)
      .map((p) => ({
        id: `p${p.id}`, grupo: 'Processos', rotulo: p.nome,
        detalhe: STATUS_PROCESSO[p.status].rotulo,
        executar: ir(`/processos/${p.id}`),
      }));

    const pes: Resultado[] = (pessoas ?? [])
      .filter((p) => bate(p.nome))
      .slice(0, 4)
      .map((p) => ({
        id: `pe${p.id}`, grupo: 'Pessoas', rotulo: p.nome,
        detalhe: p.cargo ?? undefined,
        executar: ir(`/equipe/pessoas/${p.id}`),
      }));

    // Sem busca: só ações (menu de comando). Com busca: objetos primeiro.
    return nq === '' ? acoes : [...ds, ...ps, ...pes, ...acoes];
  }, [q, demandas, processos, pessoas, nav, props]);

  useEffect(() => setIdx(0), [q]);

  if (!props.aberta) return null;

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && resultados[idx]) { resultados[idx].executar(); }
    else if (e.key === 'Escape') { props.onFechar(); }
  }

  let grupoAnterior = '';

  return (
    <div className="paleta-fundo" onClick={props.onFechar}>
      <div className="paleta" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} type="text" value={q} onChange={(e) => setQ(e.target.value)}
               onKeyDown={teclas} placeholder="Buscar demandas, processos, pessoas ou ações…"
               aria-label="Busca universal" />
        <div className="resultados">
          {resultados.length === 0 && (
            <p className="mudo" style={{ padding: '14px 16px' }}>
              Nada encontrado para "{q}". Tente outro termo.
            </p>
          )}
          {resultados.map((r, i) => {
            const cabecalho = r.grupo !== grupoAnterior;
            grupoAnterior = r.grupo;
            return (
              <div key={r.id}>
                {cabecalho && <h3 style={{ padding: '8px 16px 2px' }}>{r.grupo}</h3>}
                <div className={`res ${i === idx ? 'ativo' : ''}`}
                     onMouseEnter={() => setIdx(i)} onClick={() => r.executar()}>
                  <span>{r.rotulo}</span>
                  {r.detalhe && <span className="mudo">{r.detalhe}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
