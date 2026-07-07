// Filtro de seleção múltipla — dropdown com checkboxes e rolagem.
// Vazio = "todos" (sem filtro); N selecionados = interseção exibida no botão.
import { useState } from 'react';

export interface OpcaoFiltro { id: string; nome: string }

export function MultiFiltro(props: {
  rotulo: string;
  opcoes: OpcaoFiltro[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const { selecionados } = props;

  function alternar(id: string) {
    props.onChange(
      selecionados.includes(id)
        ? selecionados.filter((x) => x !== id)
        : [...selecionados, id],
    );
  }

  const texto = selecionados.length === 0
    ? props.rotulo
    : selecionados.length === 1
      ? (props.opcoes.find((o) => o.id === selecionados[0])?.nome ?? props.rotulo)
      : `${props.rotulo} (${selecionados.length})`;

  return (
    <div style={{ position: 'relative' }}>
      <button className={`btn mini ${selecionados.length > 0 ? 'primario' : ''}`}
              onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        {texto} ▾
      </button>
      {aberto && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 45 }} onClick={() => setAberto(false)} />
          <div className="cartao" style={{ position: 'absolute', top: '110%', left: 0, zIndex: 46,
               minWidth: 230, padding: 10 }}>
            <div className="scroll-box" style={{ maxHeight: 240 }}>
              {props.opcoes.map((o) => (
                <label key={o.id} className="linha"
                       style={{ cursor: 'pointer', padding: '4px 2px' }}>
                  <input type="checkbox" style={{ width: 'auto' }}
                         checked={selecionados.includes(o.id)}
                         onChange={() => alternar(o.id)} />
                  <span>{o.nome}</span>
                </label>
              ))}
            </div>
            {selecionados.length > 0 && (
              <button className="btn mini" style={{ marginTop: 8, width: '100%' }}
                      onClick={() => props.onChange([])}>
                Limpar ({selecionados.length})
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
