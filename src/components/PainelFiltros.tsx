// Painel de filtros — recolhe os controles atrás de um ícone (canto superior direito)
// e abre um painel lateral limpo. O botão mostra quantos filtros estão ativos.
import { type ReactNode, useState } from 'react';

export function PainelFiltros(props: {
  ativos: number;
  onLimpar?: () => void;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button className={`btn mini ${props.ativos > 0 ? 'primario' : ''}`}
              onClick={() => setAberto(true)} title="Filtros" aria-haspopup="dialog">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor"
             style={{ marginRight: 6, verticalAlign: -1 }}>
          <path d="M0.5 1h13L9 6.8V12l-4-2V6.8L0.5 1z" />
        </svg>
        Filtros{props.ativos > 0 ? ` · ${props.ativos}` : ''}
      </button>

      {aberto && (
        <>
          <div className="drawer-fundo" style={{ zIndex: 55 }} onClick={() => setAberto(false)} />
          <aside className="drawer" style={{ width: 'min(340px, 94vw)', zIndex: 56 }} aria-label="Filtros">
            <header className="drawer-cabecalho" style={{ paddingBottom: 14 }}>
              <div className="linha">
                <h2 style={{ margin: 0 }}>Filtros</h2>
                {props.ativos > 0 && <span className="badge info">{props.ativos} ativo(s)</span>}
                <div className="espaco" />
                <button className="btn mini" onClick={() => setAberto(false)}>✕</button>
              </div>
            </header>
            <div className="drawer-corpo" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {props.children}
            </div>
            <footer style={{ padding: '12px 22px calc(14px + env(safe-area-inset-bottom))',
                             borderTop: '1px solid var(--borda)', display: 'flex', gap: 8,
                             background: 'var(--superficie)' }}>
              {props.onLimpar && (
                <button className="btn" style={{ flex: 1 }} disabled={props.ativos === 0}
                        onClick={props.onLimpar}>
                  Limpar tudo
                </button>
              )}
              <button className="btn primario" style={{ flex: 1 }} onClick={() => setAberto(false)}>
                Aplicar
              </button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

export function CampoFiltro(props: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <div className="mudo" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{props.rotulo}</div>
      {props.children}
    </div>
  );
}
