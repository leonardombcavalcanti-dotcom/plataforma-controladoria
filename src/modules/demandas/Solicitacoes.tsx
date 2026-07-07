// Vista Solicitações (Fluxo 4) — cartões acionáveis: decidir sem trocar de tela.
// O Centro de Aprovação completo chega com a Central de Trabalho; até lá, é aqui.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Demanda } from '../../domain/demandas';
import { TIPO_DEMANDA, VALOR } from '../../domain/demandas';
import { fmtData } from '../../domain/regras';
import * as api from '../../data/demandas.api';
import { useAcaoDemanda, useDemandas } from '../../data/demandas.queries';
import { usePessoaAtual, usePessoas } from '../../data/queries';
import { Badge, EstadoVazio } from '../../components/ui';
import type { Pessoa } from '../../domain/tipos';

type AbaSol = 'pendentes' | 'aprovadas' | 'rejeitadas';

export function Solicitacoes() {
  const nav = useNavigate();
  const { data: demandas } = useDemandas();
  const { data: eu } = usePessoaAtual();
  const [aba, setAba] = useState<AbaSol>('pendentes');

  const listas = useMemo(() => {
    const todas = demandas ?? [];
    return {
      pendentes: todas.filter((d) => d.status === 'solicitada'),
      aprovadas: todas.filter((d) => d.aprovador_id && !['solicitada', 'rejeitada'].includes(d.status)),
      rejeitadas: todas.filter((d) => d.status === 'rejeitada'),
    };
  }, [demandas]);

  const lista = listas[aba];

  return (
    <>
      <div className="linha" style={{ marginBottom: 12 }}>
        <nav className="abas" style={{ marginTop: 0 }} aria-label="Situação das solicitações">
          {([['pendentes', `Pendentes (${listas.pendentes.length})`],
             ['aprovadas', `Aprovadas (${listas.aprovadas.length})`],
             ['rejeitadas', `Rejeitadas (${listas.rejeitadas.length})`]] as [AbaSol, string][]).map(([k, r]) => (
            <button key={k} className={`aba ${aba === k ? 'ativa' : ''}`} onClick={() => setAba(k)}>{r}</button>
          ))}
        </nav>
        <div className="espaco" />
        <button className="btn" onClick={() => nav('/demandas/solicitar')}>Nova solicitação</button>
      </div>

      {lista.length === 0 ? (
        aba === 'pendentes' ? (
          <EstadoVazio titulo="Nenhuma solicitação aguardando decisão."
            acao={<button className="btn primario" onClick={() => nav('/demandas/solicitar')}>Criar solicitação</button>}>
            Qualquer colaborador pode sugerir uma demanda — o gestor aprova, devolve ou rejeita.
          </EstadoVazio>
        ) : (
          <EstadoVazio titulo={aba === 'aprovadas' ? 'Nenhuma solicitação aprovada ainda.' : 'Nenhuma solicitação rejeitada.'} />
        )
      ) : (
        <div className="grade">
          {lista.map((d) => (
            <CartaoSolicitacao key={d.id} d={d} eu={eu ?? null}
              onAbrir={() => nav(`/demandas/solicitacoes/${d.id}`)} />
          ))}
        </div>
      )}
    </>
  );
}

function CartaoSolicitacao(props: { d: Demanda; eu: Pessoa | null; onAbrir: () => void }) {
  const { d, eu } = props;
  const podeDecidir = !!eu && d.status === 'solicitada' &&
    (d.aprovador_id === eu.id || eu.perfil === 'gestor' || eu.perfil === 'admin');
  const souSolicitante = !!eu && d.criador_id === eu.id;

  return (
    <div className="cartao">
      {/* Título → Contexto → Informação → Ações (Art. 19) */}
      <div className="linha" style={{ cursor: 'pointer' }} onClick={props.onAbrir}>
        <strong>{d.titulo}</strong>
        {d.devolvida && <Badge tom="atencao">Devolvida para ajuste</Badge>}
        {d.status === 'rejeitada' && <Badge tom="neutro">Rejeitada</Badge>}
        {d.aprovador_id && !['solicitada', 'rejeitada'].includes(d.status) && <Badge tom="saudavel">Aprovada</Badge>}
        <div className="espaco" />
        <span className="mudo">prazo desejado {fmtData(d.prazo)}</span>
      </div>
      <p className="mudo" style={{ marginTop: 4 }}>
        Solicitante: {d.criador?.nome ?? '—'} · {TIPO_DEMANDA[d.tipo]} · Valor {VALOR[d.valor]}
        {d.peso !== null ? ` · Peso sugerido ${d.peso}` : ''}
        {d.tempo_estimado_h ? ` · estimativa ${d.tempo_estimado_h}h` : ''}
        {d.processo?.nome ? ` · Processo: ${d.processo.nome}` : ''}
      </p>
      {d.devolvida && d.comentario_devolucao && (
        <p className="suave" style={{ marginTop: 6 }}>↩ "{d.comentario_devolucao}"</p>
      )}
      {d.status === 'rejeitada' && d.motivo_rejeicao && (
        <p className="suave" style={{ marginTop: 6 }}>✕ "{d.motivo_rejeicao}"</p>
      )}

      {d.status === 'solicitada' && (podeDecidir || (souSolicitante && d.devolvida)) && (
        <AcoesSolicitacao d={d} podeDecidir={podeDecidir}
          podeReenviar={souSolicitante && d.devolvida} />
      )}
    </div>
  );
}

// Ações inline — reusadas também na ficha da demanda solicitada.
export function AcoesSolicitacao(props: { d: Demanda; podeDecidir: boolean; podeReenviar: boolean }) {
  const { d } = props;
  const { data: pessoas } = usePessoas();
  const acao = useAcaoDemanda(d.id);
  const [modo, setModo] = useState<'nenhum' | 'aprovar' | 'devolver' | 'rejeitar'>('nenhum');
  const [responsavel, setResponsavel] = useState('');
  const [prazo, setPrazo] = useState(d.prazo);
  const [peso, setPeso] = useState(d.peso !== null ? String(d.peso) : '');
  const [texto, setTexto] = useState('');

  const executar = (fn: () => Promise<void>, sucesso: string) =>
    acao.mutate({ acao: fn, sucesso }, { onSettled: () => setModo('nenhum') });

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--borda)', paddingTop: 10 }}>
      {modo === 'nenhum' && (
        <div className="linha">
          {props.podeDecidir && (
            <>
              <button className="btn mini primario" onClick={() => setModo('aprovar')}>Aprovar</button>
              <button className="btn mini" onClick={() => setModo('devolver')}>Devolver</button>
              <button className="btn mini perigo" onClick={() => setModo('rejeitar')}>Rejeitar</button>
            </>
          )}
          {props.podeReenviar && (
            <button className="btn mini primario" disabled={acao.isPending}
              onClick={() => executar(() => api.rpcReenviarSolicitacao(d.id), 'Solicitação reenviada')}>
              Reenviar para aprovação
            </button>
          )}
        </div>
      )}

      {modo === 'aprovar' && (
        <div className="linha" style={{ flexWrap: 'wrap' }}>
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">Responsável…</option>
            {(pessoas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={{ maxWidth: 170 }} />
          <input type="number" min={1} max={10} value={peso} onChange={(e) => setPeso(e.target.value)}
                 placeholder="Peso" title={d.peso !== null ? `Peso sugerido: ${d.peso}` : 'Peso (1–10)'}
                 style={{ maxWidth: 90 }} />
          <button className="btn mini primario" disabled={!responsavel || !prazo || acao.isPending}
            onClick={() => executar(() => api.rpcAprovarSolicitacao(d.id, responsavel, prazo, peso ? Number(peso) : null),
              'Aprovada — virou demanda no Inbox do responsável')}>
            Confirmar aprovação
          </button>
          <button className="btn mini" onClick={() => setModo('nenhum')}>Cancelar</button>
        </div>
      )}

      {(modo === 'devolver' || modo === 'rejeitar') && (
        <div className="linha" style={{ flexWrap: 'wrap' }}>
          <input type="text" style={{ flex: 1, minWidth: 220 }} autoFocus value={texto}
            placeholder={modo === 'devolver' ? 'O que precisa ser ajustado?' : 'Motivo da rejeição (permanente)'}
            onChange={(e) => setTexto(e.target.value)} />
          <button className={`btn mini ${modo === 'rejeitar' ? 'perigo' : 'primario'}`}
            disabled={!texto.trim() || acao.isPending}
            onClick={() => modo === 'devolver'
              ? executar(() => api.rpcDevolverSolicitacao(d.id, texto.trim()), 'Devolvida ao solicitante')
              : executar(() => api.rpcRejeitarSolicitacao(d.id, texto.trim()), 'Solicitação rejeitada')}>
            {modo === 'devolver' ? 'Devolver' : 'Rejeitar'}
          </button>
          <button className="btn mini" onClick={() => setModo('nenhum')}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
