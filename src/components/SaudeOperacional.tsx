// O termômetro da Controladoria (§9.1) — nunca caixa-preta:
// o número vem sempre com o breakdown, e cada componente leva à vista onde se age.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { semaforo, useSaude } from '../data/indicadores.api';
import { Badge } from './ui';

export function SaudeOperacional() {
  const nav = useNavigate();
  const { data: saude } = useSaude();
  const [aberto, setAberto] = useState(false);

  if (!saude) return null;
  const s = semaforo(saude.score);
  const fracos = saude.componentes.filter((c) => c.pontos < c.peso * 0.85);

  return (
    <div className="cartao secao" style={{ borderLeft: `3px solid var(--cor-${s.tom === 'saudavel' ? 'saudavel' : s.tom === 'atencao' ? 'atencao' : 'critico'})` }}>
      <div className="linha" style={{ cursor: 'pointer' }} onClick={() => setAberto(!aberto)}
           role="button" tabIndex={0} aria-expanded={aberto}>
        <h3 style={{ margin: 0 }}>Saúde Operacional</h3>
        <strong style={{ fontSize: 22 }}>{s.emoji} {saude.score}%</strong>
        <Badge tom={s.tom}>{s.rotulo}</Badge>
        {!aberto && fracos.length > 0 && (
          <span className="mudo">— puxando para baixo: {fracos.map((c) => c.nome).join(' · ')}</span>
        )}
        <div className="espaco" />
        <span className="mudo">{aberto ? 'ocultar' : 'ver composição'} ▾</span>
      </div>

      {aberto && (
        <ul className="lista-limpa" style={{ marginTop: 12 }}>
          {saude.componentes.map((c) => {
            const pct = c.peso > 0 ? c.pontos / c.peso : 1;
            const tom = pct >= 0.85 ? 'saudavel' : pct >= 0.6 ? 'atencao' : 'critico';
            return (
              <li key={c.nome} className="linha"
                  style={{ padding: '7px 0', borderBottom: '1px solid var(--borda)', cursor: 'pointer' }}
                  onClick={() => nav(c.rota)} title="Ir para onde se age">
                <Badge tom={tom}>{c.pontos}/{c.peso}</Badge>
                <span>{c.nome}</span>
                <div className="espaco" />
                <span className="mudo">{c.detalhe} →</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
