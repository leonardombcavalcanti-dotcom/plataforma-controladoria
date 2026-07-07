import type { Processo } from '../../../domain/tipos';
import { fmtDataHora } from '../../../domain/regras';
import { useEventos, useVersoes } from '../../../data/queries';
import { Carregando, EstadoVazio } from '../../../components/ui';

// Aba Governança — duas áreas conceituais (v1.1 do modelo):
// Governança = versionamento + auditoria · Evolução = melhorias/revisões (F2)
export function AbaGovernanca(props: { processo: Processo }) {
  const { processo: p } = props;
  const { data: versoes, isLoading: carregandoVersoes } = useVersoes(p.id);
  const { data: eventos, isLoading: carregandoEventos } = useEventos(p.id);

  const rotuloEvento: Record<string, string> = {
    criacao: 'Criação', edicao: 'Edição', transicao: 'Transição de status',
    versao: 'Nova versão', atualizacao: 'Atualização',
  };

  return (
    <div>
      <div className="secao">
        <h3>Versões (RN-08)</h3>
        {carregandoVersoes ? <Carregando linhas={2} /> : (versoes ?? []).length === 0 ? (
          <p className="suave">Ainda na versão 1 — nenhuma versão publicada além da original.</p>
        ) : (
          <ul className="lista-limpa grade">
            {(versoes ?? []).map((v) => (
              <li key={v.id} className="cartao" style={{ padding: '10px 14px' }}>
                <div className="linha">
                  <strong>v{v.versao}</strong>
                  <span className="suave">{v.motivo}</span>
                  <div className="espaco" />
                  <span className="mudo">{v.autor?.nome ?? '—'} · {fmtDataHora(v.criado_em)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="secao">
        <h3>Trilha de auditoria (imutável)</h3>
        {carregandoEventos ? <Carregando linhas={4} /> : (eventos ?? []).length === 0 ? (
          <EstadoVazio titulo="Sem eventos ainda." />
        ) : (
          <ul className="lista-limpa">
            {(eventos ?? []).map((e) => (
              <li key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)' }}>
                <div className="linha">
                  <strong style={{ minWidth: 150 }}>{rotuloEvento[e.tipo] ?? e.tipo}</strong>
                  <span className="suave">
                    {e.tipo === 'transicao' && e.dados
                      ? `${String((e.dados as Record<string, unknown>)['de'])} → ${String((e.dados as Record<string, unknown>)['para'])}` +
                        ((e.dados as Record<string, unknown>)['justificativa']
                          ? ` — "${String((e.dados as Record<string, unknown>)['justificativa'])}"` : '')
                      : e.tipo === 'versao' && e.dados
                        ? `v${String((e.dados as Record<string, unknown>)['versao'])} — ${String((e.dados as Record<string, unknown>)['motivo'])}`
                        : ''}
                  </span>
                  <div className="espaco" />
                  <span className="mudo">{e.autor?.nome ?? 'Sistema'} · {fmtDataHora(e.criado_em)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="secao">
        <h3>Evolução</h3>
        <p className="suave">
          Fila de melhorias, sugestões e revisões programadas chegam na Fase 2 (modelo §8) — os dados desta sprint já as alimentam.
        </p>
      </div>
    </div>
  );
}
