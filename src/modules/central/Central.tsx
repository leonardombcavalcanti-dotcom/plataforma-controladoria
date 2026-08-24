// Central de Trabalho — a home única (ADR-01). Cockpit é comportamento (ADR-23):
// colaborador vê o dia; gestor vê o dia + a equipe; executivo vê agregados.
// Art. 5 da Constituição: pergunta → resposta antes de qualquer gráfico.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemandas } from '../../data/demandas.queries';
import { usePessoaAtual } from '../../data/queries';
import { useBloqueiosAtivos, useOcorrenciasAbertas } from '../../data/central.api';
import { type Demanda, CAUSA_BLOQUEIO, PRIORIDADE, RECORRENCIA_DEMANDA, STATUS_DEMANDA, demandaAtrasada, ehSubstituicao, prazoTom } from '../../domain/demandas';
import { fmtCompetencia, fmtData } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import { StatusProcessos } from './StatusProcessos';

export function Central() {
  const nav = useNavigate();
  const { data: eu } = usePessoaAtual();
  const { data: demandas, isLoading } = useDemandas();
  const { data: bloqueios } = useBloqueiosAtivos();
  const { data: ocorrencias } = useOcorrenciasAbertas();

  const hoje = new Date().toISOString().slice(0, 10);
  const [horizonte, setHorizonte] = useState<'hoje' | 'semana' | 'mes'>('hoje');
  const fimHorizonte = useMemo(() => {
    if (horizonte === 'hoje') return hoje;
    const d = new Date(Date.now() + (horizonte === 'semana' ? 7 : 30) * 86400000);
    return d.toISOString().slice(0, 10);
  }, [horizonte, hoje]);
  const rotuloHorizonte = horizonte === 'hoje' ? 'Para hoje' : horizonte === 'semana' ? 'Próximos 7 dias' : 'Próximos 30 dias';
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = eu?.nome.split(' ')[0] ?? '';
  const souGestor = eu?.perfil === 'gestor' || eu?.perfil === 'admin';
  const souExecutivo = eu?.perfil === 'executivo';

  const meu = useMemo(() => {
    const lista = demandas ?? [];
    if (!eu) return null;
    const ativas = (d: Demanda) =>
      !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status);
    const minhas = lista.filter((d) => d.responsavel_id === eu.id && ativas(d));
    return {
      atrasadas: minhas.filter(demandaAtrasada),
      bloqueadas: minhas.filter((d) => d.status === 'bloqueada'),
      hojeLista: minhas.filter((d) => !demandaAtrasada(d) && d.status !== 'bloqueada' && d.prazo <= fimHorizonte),
      proximas: minhas.filter((d) => !demandaAtrasada(d) && d.status !== 'bloqueada' && d.prazo > fimHorizonte).slice(0, 5),
      aguardando: lista.filter((d) =>
        (d.status === 'em_validacao' && (d.validador_id ?? d.criador_id) === eu.id) ||
        (d.status === 'solicitada' && !d.devolvida && (d.aprovador_id === eu.id || (d.aprovador_id === null && souGestor))) ||
        (d.status === 'solicitada' && d.devolvida && d.criador_id === eu.id) ||
        (souGestor && d.status === 'concluida' && d.avaliacao_nota === null &&
          (d.responsavel_id !== eu.id || eu.perfil === 'admin'))),
    };
  }, [demandas, eu, fimHorizonte, souGestor]);

  // Atrasadas da equipe (gestor+): quem está atrasado e em quê
  const atrasadasEquipe = useMemo(() => {
    if (!eu || !(souGestor || souExecutivo)) return [];
    return (demandas ?? [])
      .filter((d) => !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status)
        && demandaAtrasada(d) && d.responsavel_id !== eu.id)
      .sort((a, b) => (a.prazo < b.prazo ? -1 : 1));
  }, [demandas, eu, souGestor, souExecutivo]);

  const equipe = useMemo(() => {
    const lista = demandas ?? [];
    const ativas = lista.filter((d) =>
      !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status));
    return {
      emAndamento: ativas.length,
      vencemAteAmanha: ativas.filter((d) => d.prazo <= amanha && !demandaAtrasada(d)).length,
      atrasadas: ativas.filter(demandaAtrasada).length,
      bloqueadas: ativas.filter((d) => d.status === 'bloqueada').length,
      pedidosAjuda: (bloqueios ?? []).filter((b) => b.pedir_ajuda),
      aprovacoes: lista.filter((d) => d.status === 'solicitada' && !d.devolvida).length,
    };
  }, [demandas, bloqueios, amanha]);

  const progressoOcorrencia = (ocorrenciaId: string) => {
    const doGrupo = (demandas ?? []).filter((d) => d.ocorrencia_id === ocorrenciaId);
    const fechadas = doGrupo.filter((d) => ['concluida', 'encerrada'].includes(d.status)).length;
    return { total: doGrupo.length, fechadas };
  };

  const abrir = (d: Demanda) => nav(`/demandas/inbox/${d.id}`);

  if (isLoading || !eu || !meu) {
    return <Carregando linhas={5} />;
  }

  const diaLimpo =
    meu.atrasadas.length === 0 && meu.aguardando.length === 0 &&
    meu.bloqueadas.length === 0 && meu.hojeLista.length === 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>{saudacao}, {primeiroNome}.</h1>
      <p className="suave" style={{ marginBottom: 16 }}>
        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {/* Horizonte do cenário: hoje · semana · mês */}
      <div className="linha" style={{ marginBottom: 14 }}>
        <span className="mudo">Cenário:</span>
        {([['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']] as ['hoje' | 'semana' | 'mes', string][]).map(([k, r]) => (
          <button key={k} className={`btn mini ${horizonte === k ? 'primario' : ''}`}
                  onClick={() => setHorizonte(k)}>{r}</button>
        ))}
      </div>

      {/* Pendências em um relance — ícone + quantitativo */}
      {!souExecutivo && (
        <div className="grade secao" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          <ChipPendencia icone="🔔" rotulo="Aguardando você" n={meu.aguardando.length} tom="atencao" />
          <ChipPendencia icone="⏰" rotulo="Atrasadas" n={meu.atrasadas.length} tom="critico" />
          <ChipPendencia icone="⛔" rotulo="Bloqueadas" n={meu.bloqueadas.length} tom="critico" />
          <ChipPendencia icone="📌" rotulo={rotuloHorizonte} n={meu.hojeLista.length} tom="info" />
          <ChipPendencia icone="🗓" rotulo="Próximas" n={meu.proximas.length} tom="neutro" />
        </div>
      )}

      {/* ===== Cockpit do gestor: a operação em 30 segundos (Art. 5) ===== */}
      {(souGestor || souExecutivo) && (
        <div className="cartao secao" style={{ borderLeft: '3px solid var(--cor-primaria)' }}>
          <h3 style={{ marginBottom: 8 }}>{souExecutivo ? 'A operação' : 'Sua equipe hoje'}</h3>
          <p style={{ fontSize: 15 }}>
            <strong>{equipe.emAndamento}</strong> demanda(s) em andamento ·{' '}
            <strong>{equipe.vencemAteAmanha}</strong> vence(m) até amanhã ·{' '}
            <strong style={equipe.atrasadas > 0 ? { color: 'var(--cor-critico)' } : undefined}>
              {equipe.atrasadas}</strong> atrasada(s) ·{' '}
            <strong>{equipe.bloqueadas}</strong> bloqueada(s)
            {equipe.pedidosAjuda.length > 0 && <> — <strong style={{ color: 'var(--cor-critico)' }}>
              {equipe.pedidosAjuda.length} pede(m) sua ajuda</strong></>} ·{' '}
            <strong>{equipe.aprovacoes}</strong> aprovação(ões) aguardando
          </p>

          {equipe.pedidosAjuda.length > 0 && (
            <div className="grade" style={{ marginTop: 12 }}>
              {equipe.pedidosAjuda.map((b) => (
                <div key={b.id} className="cartao clicavel" style={{ padding: '10px 14px' }}
                     onClick={() => b.demanda && nav(`/demandas/equipe/${b.demanda.id}`)}>
                  <div className="linha">
                    <Badge tom="critico">Pedido de ajuda</Badge>
                    <strong>{b.demanda?.titulo}</strong>
                    <div className="espaco" />
                    <span className="mudo">{b.demanda?.responsavel?.nome}</span>
                  </div>
                  <p className="suave" style={{ marginTop: 4 }}>
                    {CAUSA_BLOQUEIO[b.causa]} — {b.descricao}
                    {b.previsao_desbloqueio ? ` · previsão ${fmtData(b.previsao_desbloqueio)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}

          {equipe.aprovacoes > 0 && !souExecutivo && (
            <div className="linha" style={{ marginTop: 12 }}>
              <button className="btn mini primario" onClick={() => nav('/demandas/solicitacoes')}>
                Decidir {equipe.aprovacoes} solicitação(ões)
              </button>
            </div>
          )}

          {(ocorrencias ?? []).length > 0 && (
            <>
              <h3 style={{ margin: '16px 0 8px' }}>Rotinas em andamento</h3>
              <div className="linha" style={{ flexWrap: 'wrap' }}>
                {(ocorrencias ?? []).map((o) => {
                  const p = progressoOcorrencia(o.id);
                  const completa = p.total > 0 && p.fechadas === p.total;
                  return (
                    <button key={o.id} className="btn mini"
                            onClick={() => o.processo && nav(`/processos/${o.processo.id}`)}>
                      {o.processo?.nome} · {fmtCompetencia(o.competencia)} —{' '}
                      <strong style={completa ? { color: 'var(--cor-saudavel)' } : undefined}>
                        {p.fechadas}/{p.total}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Atrasadas da equipe — cards, só para gestor/executivo */}
      {(souGestor || souExecutivo) && atrasadasEquipe.length > 0 && (
        <div className="secao">
          <h3 style={{ marginBottom: 8 }}>
            Atrasadas da equipe <Badge tom="critico">{atrasadasEquipe.length}</Badge>
          </h3>
          <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
            {atrasadasEquipe.slice(0, 9).map((d) => (
              <div key={d.id} className="cartao clicavel" style={{ borderLeft: '3px solid var(--cor-critico)' }}
                   onClick={() => nav(`/demandas/equipe/${d.id}`)} role="button" tabIndex={0}>
                <strong style={{ display: 'block', marginBottom: 6 }}>{d.titulo}</strong>
                <div className="linha" style={{ flexWrap: 'wrap' }}>
                  <Badge tom="critico">{fmtData(d.prazo)}</Badge>
                  <Badge tom={STATUS_DEMANDA[d.status].tom}>{STATUS_DEMANDA[d.status].rotulo}</Badge>
                  {d.recorrencia && <Badge tom="info">↻</Badge>}
                </div>
                <p className="mudo" style={{ marginTop: 6 }}>
                  {d.responsavel?.nome ?? '—'} · {d.processo?.nome ?? 'Avulsa'}
                </p>
              </div>
            ))}
          </div>
          {atrasadasEquipe.length > 9 && (
            <button className="btn mini" style={{ marginTop: 8 }} onClick={() => nav('/demandas/equipe')}>
              Ver todas as {atrasadasEquipe.length}
            </button>
          )}
        </div>
      )}

      <StatusProcessos />

      {/* ===== Meu dia (todos os perfis operacionais) ===== */}
      {!souExecutivo && (
        diaLimpo ? (
          <EstadoVazio titulo="🎉 Nenhuma pendência agora.">
            Suas demandas, validações e aprovações aparecem aqui assim que chegarem.
          </EstadoVazio>
        ) : (
          <>
            <Bloco titulo="Atrasadas" tom="critico" itens={meu.atrasadas} onAbrir={abrir} />
            <Bloco titulo="Aguardando você" tom="atencao" itens={meu.aguardando} onAbrir={abrir}
              legenda={(d) => d.status === 'em_validacao' ? 'validar'
                : d.status === 'concluida' ? 'avaliar'
                : d.devolvida ? 'ajustar e reenviar' : 'aprovar'} />
            <Bloco titulo="Bloqueadas" tom="critico" itens={meu.bloqueadas} onAbrir={abrir} />
            <Bloco titulo={rotuloHorizonte} tom="info" itens={meu.hojeLista} onAbrir={abrir} />
            <Bloco titulo="Próximos prazos" tom="neutro" itens={meu.proximas} onAbrir={abrir} />
          </>
        )
      )}
    </div>
  );
}

function ChipPendencia(props: {
  icone: string; rotulo: string; n: number;
  tom: 'neutro' | 'info' | 'atencao' | 'critico';
}) {
  const cor = props.n === 0 ? 'var(--texto-mudo)'
    : props.tom === 'critico' ? 'var(--cor-critico)'
    : props.tom === 'atencao' ? 'var(--cor-atencao)'
    : props.tom === 'info' ? 'var(--cor-primaria)' : 'var(--texto)';
  return (
    <div className="cartao" style={{ textAlign: 'center', padding: '12px 8px',
         opacity: props.n === 0 ? 0.65 : 1 }}>
      <div style={{ fontSize: 20 }}>{props.icone}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: cor, lineHeight: 1.2 }}>{props.n}</div>
      <div className="mudo">{props.rotulo}</div>
    </div>
  );
}

function Bloco(props: {
  titulo: string;
  tom: 'neutro' | 'info' | 'atencao' | 'critico';
  itens: Demanda[];
  onAbrir: (d: Demanda) => void;
  legenda?: (d: Demanda) => string;
}) {
  if (props.itens.length === 0) return null;
  return (
    <div className="secao">
      <h3 style={{ marginBottom: 8 }}>
        {props.titulo} <Badge tom={props.tom}>{props.itens.length}</Badge>
      </h3>
      {/* Cards visuais (ajuste do product owner): grade responsiva com o detalhamento */}
      <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {props.itens.map((d) => (
          <div key={d.id} className="cartao clicavel"
               onClick={() => props.onAbrir(d)} role="button" tabIndex={0}
               onKeyDown={(e) => e.key === 'Enter' && props.onAbrir(d)}>
            <strong style={{ display: 'block', marginBottom: 8 }}>{d.titulo}</strong>
            <div className="linha" style={{ flexWrap: 'wrap' }}>
              <Badge tom={STATUS_DEMANDA[d.status].tom}>{STATUS_DEMANDA[d.status].rotulo}</Badge>
              {d.prioridade !== 'media' && (
                <Badge tom={PRIORIDADE[d.prioridade].tom}>{PRIORIDADE[d.prioridade].rotulo}</Badge>
              )}
              {d.recorrencia && <Badge tom="info">↻ {RECORRENCIA_DEMANDA[d.recorrencia]}</Badge>}
              {props.legenda && <Badge tom="atencao">{props.legenda(d)}</Badge>}
              {ehSubstituicao(d) && <Badge tom="atencao">🔄 substituição</Badge>}
            </div>
            <p className="mudo" style={{ marginTop: 8 }}>
              {d.processo?.nome ?? 'Avulsa'}
            </p>
            <div className="linha" style={{ marginTop: 8 }}>
              <Badge tom={prazoTom(d)}>{fmtData(d.prazo)}</Badge>
              <div className="espaco" />
              <span className="mudo">{d.responsavel?.nome ?? d.criador?.nome ?? ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
