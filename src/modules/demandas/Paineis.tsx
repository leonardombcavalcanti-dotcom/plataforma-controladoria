// Painéis de ação da demanda — bloqueio (Fluxo 6 enriquecido), delegação,
// encerramento (ADR-09), reprovação de validação, conclusão com pendências.
import { useState } from 'react';
import type { CausaBloqueio, ComplexidadeDemanda, Demanda, MotivoEncerramento, PrioridadeDemanda, ValorDemanda } from '../../domain/demandas';
import { CAUSA_BLOQUEIO, COMPLEXIDADE, MOTIVO_ENCERRAMENTO, PRIORIDADE, VALOR } from '../../domain/demandas';
import { usePessoas } from '../../data/queries';
import { calcularNota, faixaNota, pesoEfetivo } from '../../domain/desempenho';
import { Badge } from '../../components/ui';

function PainelBase(props: { titulo: string; children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="modal-fundo" onClick={props.onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{props.titulo}</h2>
        {props.children}
      </div>
    </div>
  );
}

export function PainelBloqueio(props: {
  onConfirmar: (causa: CausaBloqueio, descricao: string, previsao: string | null, pedirAjuda: boolean) => void;
  onFechar: () => void;
}) {
  const [causa, setCausa] = useState<CausaBloqueio>('sistema');
  const [descricao, setDescricao] = useState('');
  const [previsao, setPrevisao] = useState('');
  const [pedirAjuda, setPedirAjuda] = useState(false);
  return (
    <PainelBase titulo="Por que esta demanda está bloqueada?" onFechar={props.onFechar}>
      <p className="suave" style={{ marginBottom: 12 }}>
        A causa alimenta o indicador "maior causa de atrasos". Um único ato: ninguém precisa ser avisado por fora.
      </p>
      <div className="grade" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
        {(Object.entries(CAUSA_BLOQUEIO) as [CausaBloqueio, string][]).map(([k, v]) => (
          <button key={k} className={`btn mini ${causa === k ? 'primario' : ''}`} onClick={() => setCausa(k)}>
            {v}
          </button>
        ))}
      </div>
      <label className="campo">
        <span>Descreva rapidamente</span>
        <textarea autoFocus value={descricao} onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: acesso ao ERP caiu desde 9h40" />
      </label>
      <label className="campo">
        <span>Previsão de desbloqueio (opcional)</span>
        <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
      </label>
      <label className="linha" style={{ cursor: 'pointer', marginBottom: 8 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={pedirAjuda}
               onChange={(e) => setPedirAjuda(e.target.checked)} />
        <span>Solicitar ajuda ao gestor</span>
      </label>
      <div className="acoes">
        <button className="btn" onClick={props.onFechar}>Cancelar</button>
        <button className="btn primario" disabled={!descricao.trim()}
                onClick={() => props.onConfirmar(causa, descricao.trim(), previsao || null, pedirAjuda)}>
          Confirmar bloqueio
        </button>
      </div>
    </PainelBase>
  );
}

export function PainelDelegacao(props: {
  demanda: Demanda;
  onConfirmar: (novoResponsavel: string, mensagem: string) => void;
  onFechar: () => void;
}) {
  const { data: pessoas } = usePessoas();
  const [para, setPara] = useState('');
  const [mensagem, setMensagem] = useState('');
  return (
    <PainelBase titulo="Delegar demanda" onFechar={props.onFechar}>
      <p className="suave" style={{ marginBottom: 12 }}>
        Quem delega vira observador automaticamente e segue acompanhando (ADR-08). Toda a cadeia fica na timeline.
      </p>
      <label className="campo">
        <span>Novo responsável</span>
        <select autoFocus value={para} onChange={(e) => setPara(e.target.value)}>
          <option value="">Selecione…</option>
          {(pessoas ?? []).filter((p) => p.id !== props.demanda.responsavel_id).map((p) => (
            <option key={p.id} value={p.id}>{p.nome}{p.cargo ? ` — ${p.cargo}` : ''}</option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Mensagem de contexto (opcional)</span>
        <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Ex.: priorize as premissas de frota" />
      </label>
      <div className="acoes">
        <button className="btn" onClick={props.onFechar}>Cancelar</button>
        <button className="btn primario" disabled={!para}
                onClick={() => props.onConfirmar(para, mensagem.trim())}>
          Delegar
        </button>
      </div>
    </PainelBase>
  );
}

export function PainelEncerramento(props: {
  demandas: Demanda[];       // candidatas a "original" (duplicada)
  onConfirmar: (motivo: MotivoEncerramento, justificativa: string, original: string | null) => void;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoEncerramento>('cancelada');
  const [justificativa, setJustificativa] = useState('');
  const [original, setOriginal] = useState('');
  const pode = justificativa.trim() && (motivo !== 'duplicada' || original);
  return (
    <PainelBase titulo="Encerrar sem execução" onFechar={props.onFechar}>
      <p className="suave" style={{ marginBottom: 12 }}>
        Encerramento ≠ conclusão (ADR-09): não conta como produtividade e alimenta a qualidade da entrada de demandas.
      </p>
      <div className="linha" style={{ marginBottom: 12 }}>
        {(Object.entries(MOTIVO_ENCERRAMENTO) as [MotivoEncerramento, string][]).map(([k, v]) => (
          <button key={k} className={`btn mini ${motivo === k ? 'primario' : ''}`} onClick={() => setMotivo(k)}>
            {v}
          </button>
        ))}
      </div>
      {motivo === 'duplicada' && (
        <label className="campo">
          <span>Qual é a demanda original?</span>
          <select value={original} onChange={(e) => setOriginal(e.target.value)}>
            <option value="">Selecione…</option>
            {props.demandas.map((d) => <option key={d.id} value={d.id}>{d.titulo}</option>)}
          </select>
        </label>
      )}
      <label className="campo">
        <span>Justificativa (obrigatória — fica na auditoria)</span>
        <textarea autoFocus value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
      </label>
      <div className="acoes">
        <button className="btn" onClick={props.onFechar}>Cancelar</button>
        <button className="btn perigo" disabled={!pode}
                onClick={() => props.onConfirmar(motivo, justificativa.trim(), original || null)}>
          Encerrar demanda
        </button>
      </div>
    </PainelBase>
  );
}

export function PainelReprovacao(props: {
  onConfirmar: (motivo: string) => void;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <PainelBase titulo="Reprovar validação" onFechar={props.onFechar}>
      <p className="suave" style={{ marginBottom: 12 }}>
        A demanda volta para Em Execução e o retrabalho é registrado (+1) — insumo do indicador de qualidade.
      </p>
      <label className="campo">
        <span>O que precisa ser corrigido?</span>
        <textarea autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <div className="acoes">
        <button className="btn" onClick={props.onFechar}>Cancelar</button>
        <button className="btn perigo" disabled={!motivo.trim()} onClick={() => props.onConfirmar(motivo.trim())}>
          Reprovar e devolver
        </button>
      </div>
    </PainelBase>
  );
}

export function PainelReabertura(props: {
  onConfirmar: (justificativa: string, novoPrazo: string) => void;
  onFechar: () => void;
}) {
  const [justificativa, setJustificativa] = useState('');
  const [prazo, setPrazo] = useState('');
  return (
    <PainelBase titulo="Reabrir demanda" onFechar={props.onFechar}>
      <label className="campo">
        <span>Justificativa (obrigatória)</span>
        <textarea autoFocus value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
      </label>
      <label className="campo">
        <span>Novo prazo</span>
        <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
      </label>
      <div className="acoes">
        <button className="btn" onClick={props.onFechar}>Cancelar</button>
        <button className="btn primario" disabled={!justificativa.trim() || !prazo}
                onClick={() => props.onConfirmar(justificativa.trim(), prazo)}>
          Reabrir
        </button>
      </div>
    </PainelBase>
  );
}

export function PainelPendencias(props: {
  quantidade: number;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  return (
    <PainelBase titulo={`Concluir com ${props.quantidade} item(ns) pendente(s)?`} onFechar={props.onFechar}>
      <p className="suave">
        O checklist não está completo. A conclusão com pendências fica registrada na auditoria da demanda.
      </p>
      <div className="acoes">
        <button className="btn" onClick={props.onFechar}>Voltar ao checklist</button>
        <button className="btn primario" onClick={props.onConfirmar}>Concluir mesmo assim</button>
      </div>
    </PainelBase>
  );
}

export function PainelValidacaoEntrega(props: {
  d: Demanda;
  onConfirmar: (comentario: string) => void;
  onFechar: () => void;
}) {
  const { d } = props;
  const [comentario, setComentario] = useState('');
  const [verBase, setVerBase] = useState(false);
  const n = calcularNota([d]);
  const f = n.nota !== null ? faixaNota(n.nota) : null;
  const cor = f?.tom === 'saudavel' ? 'var(--cor-saudavel)'
    : f?.tom === 'info' ? 'var(--cor-primaria)'
    : f?.tom === 'atencao' ? 'var(--cor-atencao)' : 'var(--cor-critico)';
  const num = (v: number) => Math.round(v * 10) / 10;
  const temComentario = comentario.trim().length > 0;

  return (
    <PainelBase titulo="Validar a entrega" onFechar={props.onFechar}>
      <p className="suave" style={{ marginBottom: 12 }}>
        A nota é calculada automaticamente — o gestor não pontua. Dê o ok na entrega e,
        se necessário, deixe um comentário: ele chega ao responsável. Comente a entrega, nunca a pessoa.
      </p>

      <div className="cartao nota-cartao" style={{ borderLeft: `4px solid ${cor}` }}>
        <div className="linha" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: cor, lineHeight: 1.2 }}>
              {f?.rotulo ?? '—'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <strong style={{ fontSize: 28, color: cor, lineHeight: 1.1 }}>{n.nota ?? '—'}</strong>
              <span className="mudo">/100</span>
            </div>
          </div>
          <div className="espaco" />
          <span className="mudo">peso efetivo {pesoEfetivo(d)}</span>
          <button className="btn-ajuda" aria-expanded={verBase}
                  title="Ver a base de cálculo desta nota"
                  onClick={() => setVerBase(!verBase)}>?</button>
        </div>

        {verBase && (
          <>
            <ul className="termos-calculo" style={{ marginTop: 10 }}>
              {n.componentes.map((comp) => (
                <li key={comp.nome}>
                  <span className="mono termo-valor">{num(comp.valorExato)}</span>
                  <span>
                    <strong>{comp.nome}</strong> ({comp.peso}%) — {comp.detalhe}
                    <br />
                    <span className="mono" style={{ fontSize: 11.5 }}>{comp.formula}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mudo" style={{ marginTop: 8, fontSize: 11.5 }}>
              Soma: {n.componentes.map((x) => num((x.valorExato * x.peso) / 100)).join(' + ')} ={' '}
              <strong>{n.nota}</strong> · 90–100 Excelente · 75–89 Bom · 60–74 Atenção · abaixo de 60 Crítico
            </p>
          </>
        )}
      </div>

      {d.avaliacao_comentario && (
        <p className="mudo" style={{ marginTop: 10 }}>
          Comentário anterior: "{d.avaliacao_comentario}"
        </p>
      )}

      <label className="campo" style={{ marginTop: 10 }}>
        <span>Comentário ao responsável (opcional)</span>
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)}
                  placeholder="O que foi bem? O que melhorar na próxima?" />
      </label>
      <div className="acoes">
        <button className="btn" onClick={props.onFechar}>Cancelar</button>
        <button className="btn primario" onClick={() => props.onConfirmar(comentario.trim())}>
          {temComentario ? 'Validar e enviar comentário' : 'Validar entrega (OK)'}
        </button>
      </div>
    </PainelBase>
  );
}

// Edição pós-criação (V2) — somente gestor/admin; toda mudança fica na auditoria.
export function PainelEdicao(props: {
  d: Demanda;
  onConfirmar: (patch: Record<string, unknown>) => void;
  onFechar: () => void;
}) {
  const { d } = props;
  const [titulo, setTitulo] = useState(d.titulo);
  const [descricao, setDescricao] = useState(d.descricao ?? '');
  const [prazo, setPrazo] = useState(d.prazo);
  const [prioridade, setPrioridade] = useState<PrioridadeDemanda>(d.prioridade);
  const [valor, setValor] = useState<ValorDemanda>(d.valor);
  const [complexidade, setComplexidade] = useState<ComplexidadeDemanda | ''>(d.complexidade ?? '');
  const [peso, setPeso] = useState(d.peso !== null ? String(d.peso) : '');
  const [estimado, setEstimado] = useState(d.tempo_estimado_h !== null ? String(d.tempo_estimado_h) : '');
  const [anexoObrig, setAnexoObrig] = useState(d.anexo_obrigatorio);

  return (
    <PainelBase titulo="Editar demanda (gestor)" onFechar={props.onFechar}>
      <p className="suave" style={{ marginBottom: 12 }}>
        Ajustes de prazo e peso são decisão de gestor — a alteração fica registrada na timeline.
      </p>
      <label className="campo"><span>Título</span>
        <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
      <div className="grade" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <label className="campo"><span>Prazo</span>
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
        <label className="campo"><span>Peso (1–10)</span>
          <input type="number" min={1} max={10} value={peso} onChange={(e) => setPeso(e.target.value)} /></label>
        <label className="campo"><span>Estimado (h)</span>
          <input type="number" min={0.5} step={0.5} value={estimado} onChange={(e) => setEstimado(e.target.value)} /></label>
        <label className="campo"><span>Prioridade</span>
          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeDemanda)}>
            {Object.entries(PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select></label>
        <label className="campo"><span>Valor</span>
          <select value={valor} onChange={(e) => setValor(e.target.value as ValorDemanda)}>
            {Object.entries(VALOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="campo"><span>Complexidade</span>
          <select value={complexidade} onChange={(e) => setComplexidade(e.target.value as ComplexidadeDemanda | '')}>
            <option value="">—</option>
            {Object.entries(COMPLEXIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
      </div>
      <label className="campo"><span>Descrição</span>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
      <label className="linha" style={{ cursor: 'pointer', marginBottom: 8 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={anexoObrig}
               onChange={(e) => setAnexoObrig(e.target.checked)} />
        <span>Anexo de documentação obrigatório na conclusão</span>
      </label>
      <div className="acoes">
        <button className="btn" onClick={props.onFechar}>Cancelar</button>
        <button className="btn primario" disabled={!titulo.trim() || !prazo}
          onClick={() => props.onConfirmar({
            titulo: titulo.trim(),
            descricao: descricao.trim() || null,
            prazo,
            prioridade, valor,
            complexidade: complexidade || null,
            peso: peso ? Number(peso) : null,
            tempo_estimado_h: estimado ? Number(estimado) : null,
            anexo_obrigatorio: anexoObrig,
          })}>
          Salvar alterações
        </button>
      </div>
    </PainelBase>
  );
}
