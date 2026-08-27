import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAcaoDemanda, useBloqueios, useChecklist, useComentarios,
  useDemanda, useDemandas, useInvalidarDemanda, useTempos, useObservadores,
} from '../../data/demandas.queries';
import { useEventos, usePessoaAtual, usePessoas } from '../../data/queries';
import * as api from '../../data/demandas.api';
import {
  type CausaBloqueio, type MotivoEncerramento,
  STATUS_DEMANDA, PRIORIDADE, TIPO_DEMANDA, VALOR, MOTIVO_CONCLUSAO,
  MOTIVO_ENCERRAMENTO, CAUSA_BLOQUEIO, RECORRENCIA_DEMANDA, descreverEvento, ehSubstituicao, prazoTom,
} from '../../domain/demandas';
import { fmtData, fmtDataHora } from '../../domain/regras';
import { calcularNota } from '../../domain/desempenho';
import { Badge, Carregando } from '../../components/ui';
import {
  PainelBloqueio, PainelDelegacao, PainelEncerramento,
  PainelPendencias, PainelReabertura, PainelReprovacao,
  PainelComentarioEntrega,
} from './Paineis';
import { AcoesSolicitacao } from './Solicitacoes';
import { AnexosDemanda } from './Anexos';
import { PainelEdicao } from './Paineis';

type Aba = 'atividade' | 'checklist' | 'tempo' | 'anexos';
type Painel = 'bloqueio' | 'delegacao' | 'encerramento' | 'reprovacao' | 'reabertura' | 'pendencias' | 'avaliacao' | 'edicao' | null;

export function FichaDemanda() {
  const { vista = 'inbox', id = '' } = useParams();
  const nav = useNavigate();
  const { data: d, isLoading } = useDemanda(id);
  const { data: demandas } = useDemandas();
  const { data: eu } = usePessoaAtual();
  const { data: pessoas } = usePessoas();
  const { data: checklist } = useChecklist(id);
  const { data: comentarios } = useComentarios(id);
  const { data: bloqueios } = useBloqueios(id);
  const { data: tempos } = useTempos(id);
  const { data: observadores } = useObservadores(id);
  const { data: eventos } = useEventos(id);
  const acao = useAcaoDemanda(id);
  const invalidar = useInvalidarDemanda();

  const [aba, setAba] = useState<Aba>('atividade');
  const [painel, setPainel] = useState<Painel>(null);
  const [expandido, setExpandido] = useState(false);
  const [comentario, setComentario] = useState('');
  const [novoItem, setNovoItem] = useState('');
  const [horas, setHoras] = useState('');
  const [dataTempo, setDataTempo] = useState(new Date().toISOString().slice(0, 10));

  const fechar = () => nav(`/demandas/${vista}`);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !painel && fechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painel]);

  const nomeDe = useMemo(() => {
    const mapa = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));
    return (pid: unknown) => mapa.get(String(pid)) ?? '—';
  }, [pessoas]);

  if (isLoading || !d || !eu) {
    return (
      <>
        <div className="drawer-fundo" onClick={fechar} />
        <aside className="drawer"><div style={{ padding: 24 }}><Carregando linhas={4} /></div></aside>
      </>
    );
  }

  const st = STATUS_DEMANDA[d.status];
  const souResponsavel = d.responsavel_id === eu.id;
  const souValidador = (d.validador_id ?? d.criador_id) === eu.id;
  const souGestor = eu.perfil === 'gestor' || eu.perfil === 'admin';
  const podeAgir = souResponsavel || souGestor;
  const ehSolicitacao = d.status === 'solicitada';
  const ehRejeitada = d.status === 'rejeitada';
  const finalizada = ['concluida', 'encerrada', 'rejeitada'].includes(d.status);
  const pendentes = (checklist ?? []).filter((c) => !c.feito).length;
  const bloqueioAtivo = (bloqueios ?? []).find((b) => !b.fim);
  const totalHoras = (tempos ?? []).reduce((s, t) => s + Number(t.horas), 0);

  const executar = (fn: () => Promise<void>, sucesso?: string) =>
    acao.mutate({ acao: fn, sucesso });

  const atividade = [
    ...(comentarios ?? []).map((c) => ({
      id: `c${c.id}`, data: c.criado_em, autor: c.autor?.nome ?? '—',
      texto: c.texto, comentario: true,
    })),
    ...(eventos ?? []).map((e) => ({
      id: `e${e.id}`, data: e.criado_em, autor: e.autor?.nome ?? 'Sistema',
      texto: descreverEvento(e.tipo, e.dados, nomeDe), comentario: false,
    })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1));

  return (
    <>
      <div className="drawer-fundo" onClick={fechar} />
      <aside className={`drawer ${expandido ? 'expandido' : ''}`} aria-label="Ficha da demanda">
        <header className="drawer-cabecalho">
          <div className="linha">
            <span className="mudo">Demandas › {d.processo?.nome ?? (ehSolicitacao ? 'Solicitação' : 'Avulsa')}</span>
            <div className="espaco" />
            <button className="btn mini" onClick={() => setExpandido(!expandido)}>
              {expandido ? 'Recolher' : 'Expandir'}
            </button>
            <button className="btn mini" onClick={fechar}>✕ Fechar</button>
          </div>

          <div className="linha" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <h1>{d.titulo}</h1>
            <Badge tom={st.tom}>{st.rotulo}</Badge>
            {ehSolicitacao && d.devolvida && <Badge tom="atencao">Devolvida para ajuste</Badge>}
            {d.motivo_conclusao && <Badge tom="neutro">{MOTIVO_CONCLUSAO[d.motivo_conclusao]}</Badge>}
            {d.motivo_encerramento && <Badge tom="neutro">{MOTIVO_ENCERRAMENTO[d.motivo_encerramento]}</Badge>}
            {d.retrabalho > 0 && <Badge tom="atencao">Retrabalho ×{d.retrabalho}</Badge>}
            {d.status === 'concluida' && <Badge tom="saudavel">Nota {calcularNota([d]).nota}</Badge>}
            {d.avaliacao_comentario && <Badge tom="info">comentada</Badge>}
            {d.anexo_obrigatorio && !finalizada && <Badge tom="atencao">📎 anexo obrigatório</Badge>}
            {ehSubstituicao(d) && <Badge tom="atencao">🔄 Substituição</Badge>}
            {d.recorrencia && <Badge tom="info">↻ {RECORRENCIA_DEMANDA[d.recorrencia]}</Badge>}
          </div>

          <div className="linha" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {ehSolicitacao || ehRejeitada ? (
              <span className="suave">Solicitante: <strong>{d.criador?.nome}</strong>
                {' '}· Aprovador: <strong>{d.aprovador_id ? nomeDe(d.aprovador_id) : 'qualquer gestor'}</strong>
                {' '}· Prazo desejado: {fmtData(d.prazo)}{d.peso !== null ? ` · Peso sugerido: ${d.peso}` : ''}</span>
            ) : (
              <>
                <span className="suave">Responsável: <strong>{d.responsavel?.nome ?? '—'}</strong>{ehSubstituicao(d) && nomeDe(d.substituindo_id) !== '—' ? ` (substituindo ${nomeDe(d.substituindo_id)})` : ''}</span>
                <span className="suave">· Prazo: <Badge tom={prazoTom(d)}>{fmtData(d.prazo)}</Badge></span>
                <span className="suave">· {TIPO_DEMANDA[d.tipo]} · Prioridade {PRIORIDADE[d.prioridade].rotulo} · Valor {VALOR[d.valor]}{d.peso !== null ? ` · Peso ${d.peso}` : ''}</span>
                {d.exige_validacao && <span className="suave">· Validador: {nomeDe(d.validador_id ?? d.criador_id)}</span>}
              </>
            )}
          </div>
          {ehSolicitacao && d.devolvida && d.comentario_devolucao && (
            <p className="suave" style={{ marginTop: 6 }}>↩ Ajuste solicitado: "{d.comentario_devolucao}"</p>
          )}
          {ehRejeitada && d.motivo_rejeicao && (
            <p className="suave" style={{ marginTop: 6 }}>✕ Motivo da rejeição: "{d.motivo_rejeicao}"</p>
          )}
          {bloqueioAtivo && (
            <div className="linha" style={{ marginTop: 8 }}>
              <Badge tom="critico">
                {CAUSA_BLOQUEIO[bloqueioAtivo.causa]} — {bloqueioAtivo.descricao}
                {bloqueioAtivo.previsao_desbloqueio ? ` · previsão ${fmtData(bloqueioAtivo.previsao_desbloqueio)}` : ''}
                {bloqueioAtivo.pedir_ajuda ? ' · ajuda solicitada ao gestor' : ''}
              </Badge>
            </div>
          )}

          {ehSolicitacao && (
            <AcoesSolicitacao d={d}
              podeDecidir={d.aprovador_id === eu.id || souGestor}
              podeReenviar={d.criador_id === eu.id && d.devolvida} />
          )}

          {!ehSolicitacao && !ehRejeitada && (
            <div className="linha" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              {d.status === 'aberta' && podeAgir && (
                <button className="btn mini primario"
                  onClick={() => executar(() => api.rpcIniciar(id))}>Iniciar</button>
              )}
              {['aberta', 'em_execucao'].includes(d.status) && podeAgir && !d.exige_validacao && (
                <button className="btn mini primario"
                  onClick={() => pendentes > 0 ? setPainel('pendencias')
                    : executar(() => api.rpcConcluir(id, false), 'Demanda concluída')}>
                  Concluir
                </button>
              )}
              {d.status === 'em_execucao' && podeAgir && d.exige_validacao && (
                <button className="btn mini primario"
                  onClick={() => executar(() => api.rpcEnviarValidacao(id))}>Enviar para validação</button>
              )}
              {['aberta', 'em_execucao'].includes(d.status) && podeAgir && (
                <button className="btn mini" onClick={() => setPainel('bloqueio')}>Bloquear</button>
              )}
              {d.status === 'bloqueada' && (
                <button className="btn mini primario"
                  onClick={() => executar(() => api.rpcDesbloquear(id), 'Demanda desbloqueada')}>Desbloquear</button>
              )}
              {d.status === 'em_validacao' && (souValidador || souGestor) && (
                <>
                  <button className="btn mini primario"
                    onClick={() => executar(() => api.rpcValidar(id, true), 'Validação aprovada — demanda concluída')}>
                    Aprovar validação
                  </button>
                  <button className="btn mini perigo" onClick={() => setPainel('reprovacao')}>Reprovar</button>
                </>
              )}
              {!finalizada && souGestor && (
                <button className="btn mini" onClick={() => setPainel('edicao')}>Editar</button>
              )}
              {!finalizada && podeAgir && (
                <button className="btn mini" onClick={() => setPainel('delegacao')}>Delegar</button>
              )}
              {!finalizada && (souResponsavel || d.criador_id === eu.id || souGestor) && (
                <button className="btn mini perigo" onClick={() => setPainel('encerramento')}>Encerrar</button>
              )}
              {d.status === 'concluida' && souGestor &&
                (d.responsavel_id !== eu.id || eu.perfil === 'admin') && (
                <button className="btn mini" onClick={() => setPainel('avaliacao')}>
                  {d.avaliacao_comentario ? 'Editar comentário' : 'Comentar entrega'}
                </button>
              )}
              {['concluida', 'encerrada'].includes(d.status) && (d.criador_id === eu.id || souGestor) && (
                <button className="btn mini" onClick={() => setPainel('reabertura')}>Reabrir</button>
              )}
            </div>
          )}

          <nav className="abas" aria-label="Abas da demanda">
            {([['atividade', 'Atividade'], ['checklist', `Checklist${pendentes ? ` (${pendentes})` : ''}`], ['anexos', d.anexo_obrigatorio ? 'Anexos 📎' : 'Anexos'], ['tempo', 'Tempo']] as [Aba, string][]).map(([k, r]) => (
              <button key={k} className={`aba ${aba === k ? 'ativa' : ''}`} onClick={() => setAba(k)}>{r}</button>
            ))}
          </nav>
        </header>

        <div className="drawer-corpo">
          {d.avaliacao_comentario && aba === 'atividade' && (
            <div className="cartao secao" style={{ borderLeft: '3px solid var(--cor-primaria)' }}>
              <div className="linha">
                <strong>Comentário do gestor</strong>
                <div className="espaco" />
                <span className="mudo">{nomeDe(d.avaliada_por)}</span>
              </div>
              <p className="suave" style={{ marginTop: 6 }}>"{d.avaliacao_comentario}"</p>
            </div>
          )}
          {d.descricao && aba === 'atividade' && (
            <div className="secao"><h3>Descrição</h3><p className="suave" style={{ whiteSpace: 'pre-wrap' }}>{d.descricao}</p></div>
          )}

          {aba === 'atividade' && (
            <>
              <div className="secao">
                <div className="linha">
                  <textarea placeholder="Escreva um comentário…" value={comentario}
                            onChange={(e) => setComentario(e.target.value)} style={{ minHeight: 44 }} />
                  <button className="btn primario" disabled={!comentario.trim()}
                    onClick={() => { void api.comentar(id, eu.id, comentario.trim()).then(() => { setComentario(''); invalidar(id); }); }}>
                    Comentar
                  </button>
                </div>
              </div>
              <div className="secao">
                <h3>Timeline</h3>
                <ul className="lista-limpa">
                  {atividade.map((a) => (
                    <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)' }}>
                      <div className="linha">
                        <span style={a.comentario ? { fontWeight: 600 } : undefined}>
                          {a.comentario ? `💬 ${a.texto}` : a.texto}
                        </span>
                        <div className="espaco" />
                        <span className="mudo">{a.autor} · {fmtDataHora(a.data)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {(observadores ?? []).length > 0 && (
                <div className="secao">
                  <h3>Observadores</h3>
                  <p className="suave">{(observadores ?? []).map((o) => o.pessoa?.nome).filter(Boolean).join(' · ')}</p>
                </div>
              )}
            </>
          )}

          {aba === 'checklist' && (
            <div className="secao">
              <ul className="lista-limpa grade">
                {(checklist ?? []).map((c) => (
                  <li key={c.id} className="linha" style={{ padding: '6px 0' }}>
                    <label className="linha" style={{ cursor: podeAgir && !finalizada ? 'pointer' : 'default', flex: 1 }}>
                      <input type="checkbox" style={{ width: 'auto' }} checked={c.feito}
                             disabled={!podeAgir || finalizada || ehSolicitacao}
                             onChange={(e) => { void api.marcarChecklist(c.id, e.target.checked, eu.id).then(() => invalidar(id)); }} />
                      <span style={c.feito ? { textDecoration: 'line-through', color: 'var(--texto-mudo)' } : undefined}>
                        {c.texto}
                      </span>
                    </label>
                    {c.feito && c.feito_em && <span className="mudo">{nomeDe(c.feito_por)} · {fmtData(c.feito_em)}</span>}
                  </li>
                ))}
              </ul>
              {podeAgir && !finalizada && !ehSolicitacao && (
                <div className="linha" style={{ marginTop: 12 }}>
                  <input type="text" placeholder="Novo item…" value={novoItem}
                         onChange={(e) => setNovoItem(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && novoItem.trim()) {
                             void api.adicionarChecklist(id, novoItem.trim(), (checklist?.length ?? 0) + 1)
                               .then(() => { setNovoItem(''); invalidar(id); });
                           }
                         }} />
                </div>
              )}
            </div>
          )}

          {aba === 'anexos' && (
            <AnexosDemanda demandaId={id} obrigatorio={d.anexo_obrigatorio}
              podeEditar={podeAgir && !finalizada && !ehSolicitacao} />
          )}

          {aba === 'tempo' && (
            <div className="secao">
              <p className="suave" style={{ marginBottom: 12 }}>
                Total apontado: <strong>{totalHoras}h</strong>
                {d.tempo_estimado_h ? ` · Estimado: ${d.tempo_estimado_h}h` : ''} — apontamento é opcional, nunca vigilância.
              </p>
              {!finalizada && !ehSolicitacao && (
                <div className="linha" style={{ marginBottom: 14 }}>
                  <input type="number" min={0.5} step={0.5} placeholder="Horas" style={{ maxWidth: 100 }}
                         value={horas} onChange={(e) => setHoras(e.target.value)} />
                  <input type="date" style={{ maxWidth: 170 }} value={dataTempo}
                         onChange={(e) => setDataTempo(e.target.value)} />
                  <button className="btn primario mini" disabled={!horas || Number(horas) <= 0}
                    onClick={() => executar(() => api.rpcApontarTempo(id, Number(horas), dataTempo), 'Tempo apontado')}>
                    Apontar
                  </button>
                </div>
              )}
              <ul className="lista-limpa">
                {(tempos ?? []).map((t) => (
                  <li key={t.id} className="linha" style={{ padding: '6px 0', borderBottom: '1px solid var(--borda)' }}>
                    <strong>{t.horas}h</strong>
                    <span className="suave">{t.comentario ?? ''}</span>
                    <div className="espaco" />
                    <span className="mudo">{t.pessoa?.nome} · {fmtData(t.data)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>

      {painel === 'bloqueio' && (
        <PainelBloqueio onFechar={() => setPainel(null)}
          onConfirmar={(causa: CausaBloqueio, desc, prev, ajuda) => {
            setPainel(null);
            executar(() => api.rpcBloquear(id, causa, desc, prev, ajuda),
              ajuda ? 'Bloqueio registrado — seu gestor foi acionado' : 'Bloqueio registrado');
          }} />
      )}
      {painel === 'delegacao' && (
        <PainelDelegacao demanda={d} onFechar={() => setPainel(null)}
          onConfirmar={(para, msg) => {
            setPainel(null);
            executar(() => api.rpcDelegar(id, para, msg || undefined), `Delegada para ${nomeDe(para)}`);
          }} />
      )}
      {painel === 'encerramento' && (
        <PainelEncerramento onFechar={() => setPainel(null)}
          demandas={(demandas ?? []).filter((x) => x.id !== id)}
          onConfirmar={(motivo: MotivoEncerramento, just, orig) => {
            setPainel(null);
            executar(() => api.rpcEncerrar(id, motivo, just, orig), 'Demanda encerrada sem execução');
          }} />
      )}
      {painel === 'reprovacao' && (
        <PainelReprovacao onFechar={() => setPainel(null)}
          onConfirmar={(motivo) => {
            setPainel(null);
            executar(() => api.rpcValidar(id, false, motivo), 'Devolvida para execução (retrabalho registrado)');
          }} />
      )}
      {painel === 'reabertura' && (
        <PainelReabertura onFechar={() => setPainel(null)}
          onConfirmar={(just, prazo) => {
            setPainel(null);
            executar(() => api.rpcReabrir(id, just, prazo), 'Demanda reaberta');
          }} />
      )}
      {painel === 'edicao' && (
        <PainelEdicao d={d} onFechar={() => setPainel(null)}
          onConfirmar={(patch) => {
            setPainel(null);
            executar(() => api.salvarDemanda(id, patch as never), 'Demanda atualizada');
          }} />
      )}
      {painel === 'avaliacao' && (
        <PainelComentarioEntrega d={d} onFechar={() => setPainel(null)}
          onConfirmar={(comentario) => {
            setPainel(null);
            executar(() => api.rpcComentarEntrega(id, comentario), 'Comentário registrado');
          }} />
      )}
      {painel === 'pendencias' && (
        <PainelPendencias quantidade={pendentes} onFechar={() => { setPainel(null); setAba('checklist'); }}
          onConfirmar={() => {
            setPainel(null);
            executar(() => api.rpcConcluir(id, true), 'Concluída com pendências registradas');
          }} />
      )}
      {acao.isPending && <span className="mudo" style={{ position: 'fixed', bottom: 20, left: 20 }}>Salvando…</span>}
      {!podeAgir && !finalizada && !ehSolicitacao && (
        <span className="mudo" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 45,
          background: 'var(--superficie)', border: '1px solid var(--borda)',
          borderRadius: 'var(--raio-sm)', padding: '6px 12px' }}>
          Demanda de colega — modo leitura
        </span>
      )}
    </>
  );
}
