// Ficha canônica da Pessoa (Art. 21) em drawer — resumo → demandas ativas → feedbacks.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePessoaAtual, usePessoas } from '../../data/queries';
import { useDemandas } from '../../data/demandas.queries';
import {
  type Feedback, type TipoFeedback, TIPO_FEEDBACK,
  useFeedbacks, useFeedbackMutations,
} from '../../data/equipe.api';
import { STATUS_DEMANDA, demandaAtrasada } from '../../domain/demandas';
import { fmtData, fmtDataHora } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import type { Pessoa } from '../../domain/tipos';

export function FichaPessoa() {
  const { vista = 'pessoas', id = '' } = useParams();
  const nav = useNavigate();
  const { data: pessoas } = usePessoas();
  const { data: eu } = usePessoaAtual();
  const { data: demandas } = useDemandas();
  const { data: feedbacks, isLoading: carregandoFb } = useFeedbacks(id);
  const { enviar } = useFeedbackMutations();

  const [novoTipo, setNovoTipo] = useState<TipoFeedback>('reconhecimento');
  const [novoTexto, setNovoTexto] = useState('');
  const [demandaVinculo, setDemandaVinculo] = useState('');

  const fechar = () => nav(`/equipe/${vista}`);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const p = (pessoas ?? []).find((x) => x.id === id);
  if (!p || !eu) {
    return (
      <>
        <div className="drawer-fundo" onClick={fechar} />
        <aside className="drawer"><div style={{ padding: 24 }}><Carregando linhas={4} /></div></aside>
      </>
    );
  }

  const gestor = (pessoas ?? []).find((x) => x.id === p.gestor_id);
  const souGestor = eu.perfil === 'gestor' || eu.perfil === 'admin';
  const podeEnviarFeedback = souGestor && p.id !== eu.id;
  const ativas = (demandas ?? []).filter((d) => d.responsavel_id === p.id &&
    !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status));
  const candidatasVinculo = (demandas ?? []).filter((d) => d.responsavel_id === p.id).slice(0, 30);

  function enviarNovo() {
    enviar.mutate({
      tenant_id: eu!.tenant_id, de_id: eu!.id, para_id: p!.id,
      tipo: novoTipo, texto: novoTexto.trim(),
      demanda_id: demandaVinculo || null,
    }, { onSuccess: () => { setNovoTexto(''); setDemandaVinculo(''); } });
  }

  return (
    <>
      <div className="drawer-fundo" onClick={fechar} />
      <aside className="drawer" aria-label="Ficha da pessoa">
        <header className="drawer-cabecalho" style={{ paddingBottom: 14 }}>
          <div className="linha">
            <span className="mudo">Equipe › Pessoas</span>
            <div className="espaco" />
            <button className="btn mini" onClick={fechar}>✕ Fechar</button>
          </div>
          <div className="linha" style={{ marginTop: 8 }}>
            <h1>{p.nome}</h1>
            <span className="suave">{p.cargo ?? ''}</span>
          </div>
          <p className="mudo" style={{ marginTop: 4 }}>
            {gestor ? `Gestor: ${gestor.nome} · ` : ''}
            {ativas.length} demanda(s) ativa(s)
            {ativas.filter(demandaAtrasada).length > 0 ? ` · ${ativas.filter(demandaAtrasada).length} atrasada(s)` : ''}
          </p>
        </header>

        <div className="drawer-corpo">
          {ativas.length > 0 && (
            <div className="secao">
              <h3>Demandas ativas</h3>
              <ul className="lista-limpa">
                {ativas.map((d) => (
                  <li key={d.id} className="linha"
                      style={{ padding: '7px 0', borderBottom: '1px solid var(--borda)', cursor: 'pointer' }}
                      onClick={() => nav(`/demandas/equipe/${d.id}`)}>
                    <span>{d.titulo}</span>
                    <Badge tom={STATUS_DEMANDA[d.status].tom}>{STATUS_DEMANDA[d.status].rotulo}</Badge>
                    <div className="espaco" />
                    <span className="mudo">{fmtData(d.prazo)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {podeEnviarFeedback && (
            <div className="cartao secao">
              <h3 style={{ marginBottom: 10 }}>Enviar feedback</h3>
              <div className="linha" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
                {(Object.entries(TIPO_FEEDBACK) as [TipoFeedback, { rotulo: string }][]).map(([k, v]) => (
                  <button key={k} className={`btn mini ${novoTipo === k ? 'primario' : ''}`}
                          onClick={() => setNovoTipo(k)}>{v.rotulo}</button>
                ))}
              </div>
              <label className="campo">
                <span>Mensagem (imutável após envio — Fluxo 9)</span>
                <textarea value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} />
              </label>
              <label className="campo">
                <span>Vincular a uma demanda (opcional)</span>
                <select value={demandaVinculo} onChange={(e) => setDemandaVinculo(e.target.value)}>
                  <option value="">—</option>
                  {candidatasVinculo.map((d) => <option key={d.id} value={d.id}>{d.titulo}</option>)}
                </select>
              </label>
              <div className="linha">
                <div className="espaco" />
                <button className="btn primario" disabled={!novoTexto.trim() || enviar.isPending}
                        onClick={enviarNovo}>
                  {enviar.isPending ? 'Enviando…' : 'Enviar feedback'}
                </button>
              </div>
            </div>
          )}

          <div className="secao">
            <h3>Feedbacks</h3>
            {carregandoFb ? <Carregando linhas={2} /> : (feedbacks ?? []).length === 0 ? (
              <EstadoVazio titulo="Nenhum feedback registrado.">
                {podeEnviarFeedback
                  ? 'Reconhecimento no momento certo vale mais que avaliação no fim do ano.'
                  : 'Feedbacks recebidos aparecem aqui, com a thread bilateral.'}
              </EstadoVazio>
            ) : (
              <div className="grade">
                {(feedbacks ?? []).map((f) => <CartaoFeedback key={f.id} f={f} eu={eu} />)}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// Cartão de feedback com thread bilateral + reação rápida (Etapa 4, 17h).
export function CartaoFeedback(props: { f: Feedback; eu: Pessoa }) {
  const { f, eu } = props;
  const { responder } = useFeedbackMutations();
  const [texto, setTexto] = useState('');
  const t = TIPO_FEEDBACK[f.tipo];
  const souDestinatario = f.para_id === eu.id;
  const jaRespondi = (f.respostas ?? []).some((r) => r.autor_id === eu.id);

  const enviarResposta = (msg: string) =>
    responder.mutate({ feedbackId: f.id, autorId: eu.id, texto: msg },
      { onSuccess: () => setTexto('') });

  return (
    <div className="cartao">
      <div className="linha">
        <Badge tom={t.tom}>{t.rotulo}</Badge>
        <span className="suave">de <strong>{f.de?.nome}</strong> para <strong>{f.para?.nome}</strong></span>
        <div className="espaco" />
        <span className="mudo">{fmtDataHora(f.criado_em)}</span>
      </div>
      <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{f.texto}</p>
      {f.demanda && <p className="mudo" style={{ marginTop: 4 }}>Vinculado a: {f.demanda.titulo}</p>}

      {(f.respostas ?? []).length > 0 && (
        <ul className="lista-limpa" style={{ marginTop: 10, borderTop: '1px solid var(--borda)' }}>
          {(f.respostas ?? []).map((r) => (
            <li key={r.id} style={{ padding: '8px 0' }}>
              <div className="linha">
                <strong>{r.autor?.nome}</strong>
                <span className="mudo">{fmtDataHora(r.criado_em)}</span>
              </div>
              <p className="suave" style={{ whiteSpace: 'pre-wrap' }}>{r.texto}</p>
            </li>
          ))}
        </ul>
      )}

      {souDestinatario && !jaRespondi && (
        <div className="linha" style={{ marginTop: 10 }}>
          <button className="btn mini" disabled={responder.isPending}
                  onClick={() => enviarResposta('👍 Concordo com o feedback.')}>👍 Concordo</button>
          <button className="btn mini" disabled={responder.isPending}
                  onClick={() => enviarResposta('💬 Gostaria de conversar sobre este feedback.')}>
            💬 Gostaria de conversar
          </button>
        </div>
      )}

      <div className="linha" style={{ marginTop: 10 }}>
        <input type="text" placeholder="Responder…" value={texto}
               onChange={(e) => setTexto(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) enviarResposta(texto.trim()); }} />
        <button className="btn mini" disabled={!texto.trim() || responder.isPending}
                onClick={() => enviarResposta(texto.trim())}>Responder</button>
      </div>
    </div>
  );
}
