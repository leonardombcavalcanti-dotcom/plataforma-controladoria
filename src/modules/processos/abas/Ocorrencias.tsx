import { useState } from 'react';
import type { Ocorrencia, Processo } from '../../../domain/tipos';
import { STATUS_OCORRENCIA, competenciaAtual, fmtCompetencia, fmtDataHora } from '../../../domain/regras';
import { useConcluirOcorrencia, useGerarOcorrencia, useOcorrencias } from '../../../data/queries';
import { Badge, Carregando, EstadoVazio } from '../../../components/ui';

// Aba Ocorrências (§4) — a unidade de medição do processo.
// Geração MANUAL nesta sprint (decisão validada); automática em sprint futura.
export function AbaOcorrencias(props: { processo: Processo }) {
  const { processo: p } = props;
  const { data: ocorrencias, isLoading } = useOcorrencias(p.id);
  const gerar = useGerarOcorrencia(p.id);
  const concluir = useConcluirOcorrencia(p.id);
  const [competencia, setCompetencia] = useState(competenciaAtual());

  const podeGerar = ['ativo', 'em_revisao'].includes(p.status); // RN-02

  if (isLoading) return <Carregando linhas={3} />;

  return (
    <div>
      {podeGerar && (
        <div className="cartao secao">
          <div className="linha">
            <label className="campo" style={{ margin: 0 }}>
              <span>Competência</span>
              <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
            </label>
            <div className="espaco" />
            <button className="btn primario" disabled={gerar.isPending}
                    onClick={() => gerar.mutate(competencia)}>
              Gerar ocorrência
            </button>
          </div>
          <p className="mudo" style={{ marginTop: 8 }}>
            A ocorrência carimba a versão vigente do processo (RN-05). As demandas da ocorrência chegam na sprint de Demandas.
          </p>
        </div>
      )}

      {(ocorrencias ?? []).length === 0 ? (
        <EstadoVazio titulo="Nenhuma execução registrada ainda.">
          {podeGerar
            ? 'Gere a primeira ocorrência para começar a medir este processo ao longo do tempo.'
            : 'Somente processos Ativos ou Em Revisão geram ocorrências (RN-02).'}
        </EstadoVazio>
      ) : (
        <ul className="lista-limpa grade">
          {(ocorrencias ?? []).map((o) => (
            <CartaoOcorrencia key={o.id} o={o}
              onConcluir={o.status === 'em_andamento' ? () => concluir.mutate(o.id) : undefined} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoOcorrencia(props: { o: Ocorrencia; onConcluir?: () => void }) {
  const { o } = props;
  const st = STATUS_OCORRENCIA[o.status];
  const resumo = o.resumo_execucao;
  return (
    <li className="cartao">
      <div className="linha">
        <strong>{fmtCompetencia(o.competencia)}</strong>
        <Badge tom={st.tom}>{st.rotulo}</Badge>
        <span className="mudo">v{o.versao_processo} do processo</span>
        <div className="espaco" />
        {props.onConcluir && (
          <button className="btn mini primario" onClick={props.onConcluir}>Concluir ocorrência</button>
        )}
      </div>
      <p className="mudo" style={{ marginTop: 6 }}>
        Iniciada em {fmtDataHora(o.criada_em)}
        {o.concluida_em ? ` · Concluída em ${fmtDataHora(o.concluida_em)}` : ''}
      </p>
      {resumo != null && (
        <div style={{ marginTop: 10, background: 'var(--cor-info-suave)', borderRadius: 'var(--raio-sm)', padding: '10px 14px' }}>
          <h3 style={{ marginBottom: 6 }}>Resumo da execução</h3>
          <p className="suave">
            Duração: {String((resumo as Record<string, unknown>)['duracao_dias'] ?? '—')} dia(s)
            {(() => {
              const comp = (resumo as Record<string, unknown>)['comparacao_anterior'] as Record<string, unknown> | null;
              return comp
                ? ` · Ocorrência anterior (${fmtCompetencia(String(comp['competencia']))}): ${String(comp['duracao_dias'])} dia(s)`
                : '';
            })()}
          </p>
        </div>
      )}
    </li>
  );
}
