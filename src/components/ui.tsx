// Design system mínimo — Títulos V–IX da Constituição
import { type ReactNode, useState } from 'react';
import { useUi } from '../store/ui';

export function Badge(props: { tom: 'neutro' | 'info' | 'saudavel' | 'atencao' | 'critico'; children: ReactNode }) {
  return <span className={`badge ${props.tom}`}>{props.children}</span>;
}

export function EstadoVazio(props: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  // Art. 23: estado vazio orientador, nunca "nenhum registro encontrado"
  return (
    <div className="estado-vazio">
      <h2>{props.titulo}</h2>
      {props.children && <p>{props.children}</p>}
      {props.acao && <div style={{ marginTop: 14 }}>{props.acao}</div>}
    </div>
  );
}

export function Carregando(props: { linhas?: number }) {
  // Art. 23/37: skeleton, nunca spinner de tela cheia
  const n = props.linhas ?? 3;
  return (
    <div className="grade" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tom}`}>{t.texto}</div>
      ))}
    </div>
  );
}

// Art. 25: modal apenas para confirmação de irreversível / justificativa obrigatória
export function ModalJustificativa(props: {
  titulo: string;
  descricao?: string;
  rotuloConfirmar: string;
  exigeTexto: boolean;
  placeholder?: string;
  destrutivo?: boolean;
  onConfirmar: (texto: string) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const podeConfirmar = !props.exigeTexto || texto.trim().length > 0;
  return (
    <div className="modal-fundo" onClick={props.onCancelar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{props.titulo}</h2>
        {props.descricao && <p className="suave">{props.descricao}</p>}
        {props.exigeTexto && (
          <label className="campo" style={{ marginTop: 12 }}>
            <span>Justificativa (obrigatória — fica registrada na auditoria)</span>
            <textarea
              autoFocus
              value={texto}
              placeholder={props.placeholder ?? 'Descreva o motivo'}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
        )}
        <div className="acoes">
          <button className="btn" onClick={props.onCancelar}>Cancelar</button>
          <button
            className={`btn ${props.destrutivo ? 'perigo' : 'primario'}`}
            disabled={!podeConfirmar}
            onClick={() => props.onConfirmar(texto.trim())}
          >
            {props.rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
