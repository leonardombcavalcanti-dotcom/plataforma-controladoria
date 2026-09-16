// Validação em lote das entregas (Sprint 23d).
// O gestor dá o ok em várias de uma vez; o comentário continua sendo
// individual, pela ficha — comentário em lote não é feedback, é ruído.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemandas } from '../../data/demandas.queries';
import { usePessoaAtual } from '../../data/queries';
import * as api from '../../data/demandas.api';
import { useQueryClient } from '@tanstack/react-query';
import type { Demanda } from '../../domain/demandas';
import { aguardaValidacao, fmtData } from '../../domain/regras';
import { calcularNota, faixaNota } from '../../domain/desempenho';
import { Badge } from '../../components/ui';
import { useUi } from '../../store/ui';

export function ValidacaoLote() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data: eu } = usePessoaAtual();
  const { data: demandas } = useDemandas();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [aberto, setAberto] = useState(true);

  const souGestor = eu?.perfil === 'gestor' || eu?.perfil === 'admin';

  const pendentes = useMemo(() => {
    if (!eu || !souGestor) return [];
    return (demandas ?? [])
      .filter((d) => aguardaValidacao(d) && (d.responsavel_id !== eu.id || eu.perfil === 'admin'))
      .sort((a, b) => (a.concluida_em ?? '') < (b.concluida_em ?? '') ? 1 : -1);
  }, [demandas, eu, souGestor]);

  if (!souGestor || pendentes.length === 0) return null;

  const todasMarcadas = marcadas.size === pendentes.length;
  const alternar = (id: string) => {
    const s = new Set(marcadas);
    if (s.has(id)) s.delete(id); else s.add(id);
    setMarcadas(s);
  };
  const alternarTodas = () =>
    setMarcadas(todasMarcadas ? new Set() : new Set(pendentes.map((d) => d.id)));

  const validar = async (ids: string[]) => {
    if (ids.length === 0) return;
    setEnviando(true);
    let ok = 0; const erros: string[] = [];
    for (const id of ids) {
      try { await api.rpcValidarEntrega(id); ok += 1; }
      catch (e) { erros.push((e as Error).message); }
    }
    await qc.invalidateQueries({ queryKey: ['demandas'] });
    setMarcadas(new Set());
    setEnviando(false);
    toast(erros.length === 0
      ? `${ok} entrega(s) validada(s)`
      : `${ok} validada(s), ${erros.length} com erro: ${erros[0]}`,
      erros.length ? 'erro' : 'ok');
  };

  return (
    <div className="cartao secao lote-box">
      <div className="linha" style={{ flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>
          Entregas aguardando sua validação <Badge tom="atencao">{pendentes.length}</Badge>
        </h2>
        <div className="espaco" />
        <button className="btn mini" onClick={() => setAberto(!aberto)}>
          {aberto ? 'ocultar ▴' : 'ver ▾'}
        </button>
      </div>

      {aberto && (
        <>
          <p className="mudo" style={{ margin: '4px 0 10px' }}>
            A nota já está calculada. Dê o ok no que estiver certo; para comentar, abra a entrega.
          </p>

          <div className="linha" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            <label className="lote-todas">
              <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} />
              <span>Selecionar todas</span>
            </label>
            <div className="espaco" />
            <button className="btn mini" disabled={enviando || marcadas.size === 0}
                    onClick={() => validar([...marcadas])}>
              Validar {marcadas.size} selecionada(s)
            </button>
            <button className="btn mini primario" disabled={enviando}
                    onClick={() => validar(pendentes.map((d) => d.id))}>
              Validar todas ({pendentes.length})
            </button>
          </div>

          <ul className="lista-limpa lote-lista">
            {pendentes.map((d) => <Linha key={d.id} d={d}
              marcada={marcadas.has(d.id)} onMarcar={() => alternar(d.id)}
              onAbrir={() => nav(`/demandas/${d.id}`)} />)}
          </ul>
        </>
      )}
    </div>
  );
}

function Linha(props: { d: Demanda; marcada: boolean; onMarcar: () => void; onAbrir: () => void }) {
  const { d } = props;
  const nota = calcularNota([d]).nota ?? 0;
  const f = faixaNota(nota);
  return (
    <li className={`lote-linha ${props.marcada ? 'marcada' : ''}`}>
      <input type="checkbox" checked={props.marcada} onChange={props.onMarcar}
             aria-label={`Selecionar ${d.titulo}`} />
      <button className="lote-titulo" onClick={props.onAbrir} title="Abrir a entrega para comentar">
        {d.titulo}
      </button>
      <Badge tom={f.tom}>{nota}</Badge>
      <span className="mudo lote-meta">{d.responsavel?.nome ?? '—'}</span>
      <span className="mudo lote-meta">entregue {fmtData(d.concluida_em)}</span>
    </li>
  );
}
