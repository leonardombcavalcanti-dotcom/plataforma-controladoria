// Aba Indicadores (§7 do modelo) — Maturidade × Conformidade, os dois eixos
// da matriz de gestão do catálogo. Cálculo no banco; aqui só a leitura.
import type { Processo } from '../../../domain/tipos';
import { useIndicadoresProcesso, semaforo } from '../../../data/indicadores.api';
import { fmtCompetencia } from '../../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../../components/ui';

export function AbaIndicadores(props: { processo: Processo }) {
  const { data: ind, isLoading } = useIndicadoresProcesso(props.processo.id);

  if (isLoading) return <Carregando linhas={4} />;
  if (!ind) return <EstadoVazio titulo="Indicadores indisponíveis." />;

  const mat = ind.maturidade;
  const conf = ind.conformidade;
  const temExecucao = (conf?.ocorrencias ?? []).length > 0;

  // Leitura da matriz (§7.2)
  const leitura = (() => {
    if (!mat || !temExecucao || conf.score === null) return null;
    const m = mat.score >= 70; const c = conf.score >= 85;
    if (m && c) return 'Processo exemplar — bem definido e bem executado.';
    if (m && !c) return 'Bem definido, mas mal executado — o problema não é o método: olhe capacidade e carga.';
    if (!m && c) return 'Roda bem no heroísmo — depende de pessoas, não do método. Documente antes que alguém saia de férias.';
    return 'Risco crítico — nem definido, nem executado. Priorize este processo.';
  })();

  return (
    <div>
      {leitura && (
        <div className="cartao secao" style={{ borderLeft: '3px solid var(--cor-primaria)' }}>
          <p><strong>Leitura da matriz:</strong> {leitura}</p>
        </div>
      )}

      <div className="secao">
        <div className="linha" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Maturidade (o processo é bem definido?)</h3>
          {mat && <strong style={{ fontSize: 18 }}>{mat.score}%</strong>}
        </div>
        {mat && (
          <ul className="lista-limpa">
            {mat.componentes.map((c) => {
              const pct = c.pontos / c.peso;
              const tom = pct >= 0.99 ? 'saudavel' : pct >= 0.5 ? 'atencao' : 'critico';
              return (
                <li key={c.nome} className="linha" style={{ padding: '6px 0', borderBottom: '1px solid var(--borda)' }}>
                  <Badge tom={tom}>{c.pontos}/{c.peso}</Badge>
                  <span>{c.nome}</span>
                  <div className="espaco" />
                  {c.dica && <span className="mudo">{c.dica}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="secao">
        <div className="linha" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Conformidade (o processo é bem executado?)</h3>
          {temExecucao && conf.score !== null && (
            <strong style={{ fontSize: 18 }}>
              {semaforo(conf.score).emoji} {conf.score}%
            </strong>
          )}
          {ind.tempo_medio_dias !== null && (
            <span className="mudo">· tempo médio {ind.tempo_medio_dias} dia(s)</span>
          )}
        </div>
        {!temExecucao ? (
          <EstadoVazio titulo="Sem execuções concluídas ainda.">
            A conformidade nasce das ocorrências: no prazo × sem retrabalho × checklist completo (RN-07).
          </EstadoVazio>
        ) : (
          <ul className="lista-limpa">
            {conf.ocorrencias.map((o) => (
              <li key={o.competencia} className="linha" style={{ padding: '6px 0', borderBottom: '1px solid var(--borda)' }}>
                <strong>{fmtCompetencia(o.competencia)}</strong>
                <Badge tom={semaforo(o.score).tom}>{o.score}%</Badge>
                <div className="espaco" />
                <span className="mudo">
                  {o.no_prazo}/{o.concluidas} no prazo
                  {o.retrabalho > 0 ? ` · retrabalho ×${o.retrabalho}` : ''}
                  {o.duracao_dias != null ? ` · ${o.duracao_dias} dia(s)` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mudo">
        Maturidade e conformidade nunca se misturam num índice só (RN-10) — são os dois eixos da decisão:
        documentar, treinar, redistribuir ou redesenhar.
      </p>
    </div>
  );
}
