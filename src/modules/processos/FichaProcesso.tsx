import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOcorrencias, useProcesso } from '../../data/queries';
import { PERIODICIDADE, STATUS_PROCESSO, fmtCompetencia, fmtData, revisaoVencida } from '../../domain/regras';
import { Badge, Carregando } from '../../components/ui';
import { CicloDeVida } from './CicloDeVida';
import { ExcluirProcesso } from './ExcluirProcesso';
import { AbaVisaoGeral } from './abas/VisaoGeral';
import { AbaComoExecutar } from './abas/ComoExecutar';
import { AbaOperacao } from './abas/Operacao';
import { AbaOcorrencias } from './abas/Ocorrencias';
import { AbaGovernanca } from './abas/Governanca';
import { AbaIndicadores } from './abas/Indicadores';

type Aba = 'visao-geral' | 'como-executar' | 'operacao' | 'ocorrencias' | 'indicadores' | 'governanca';

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: 'visao-geral', rotulo: 'Visão Geral' },
  { chave: 'como-executar', rotulo: 'Como Executar' },
  { chave: 'operacao', rotulo: 'Operação' },
  { chave: 'ocorrencias', rotulo: 'Ocorrências' },
  { chave: 'indicadores', rotulo: 'Indicadores' },
  { chave: 'governanca', rotulo: 'Governança' },
];

// Ficha canônica (Art. 21): Cabeçalho → Resumo vivo → Abas → conteúdo.
// Abre como drawer sobre a Biblioteca (ADR-24); Expandir = página cheia (Modo Trabalho).
export function FichaProcesso() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { data: p, isLoading } = useProcesso(id);
  const { data: ocorrencias } = useOcorrencias(id);
  const [aba, setAba] = useState<Aba>('visao-geral');
  const [expandido, setExpandido] = useState(false);

  const fechar = () => nav('/processos');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ultimaExecucao = ocorrencias?.find((o) => o.concluida_em)?.concluida_em ?? null;

  return (
    <>
      <div className="drawer-fundo" onClick={fechar} />
      <aside className={`drawer ${expandido ? 'expandido' : ''}`} aria-label="Ficha do processo">
        {isLoading || !p ? (
          <div style={{ padding: 24 }}><Carregando linhas={4} /></div>
        ) : (
          <>
            <header className="drawer-cabecalho">
              <div className="linha">
                <span className="mudo">Processos › {p.area?.nome ?? '—'}</span>
                <div className="espaco" />
                <button className="btn mini" onClick={() => setExpandido(!expandido)}>
                  {expandido ? 'Recolher' : 'Expandir'}
                </button>
                <button className="btn mini" onClick={fechar} aria-label="Fechar">✕ Fechar</button>
              </div>

              <div className="linha" style={{ marginTop: 8 }}>
                <h1>{p.nome}</h1>
                <Badge tom={STATUS_PROCESSO[p.status].tom}>{STATUS_PROCESSO[p.status].rotulo}</Badge>
                <Badge tom="neutro">{PERIODICIDADE[p.periodicidade]}</Badge>
                <span className="mudo">v{p.versao}</span>
              </div>

              {/* §7.4 — Saúde do Processo: leitura consolidada (subset MVP), sempre antes de formulário (Art. 22) */}
              <div className="linha" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <span className="suave">Dono: <strong>{p.dono?.nome ?? '—'}</strong></span>
                <span className="suave">· Última execução: <strong>{fmtData(ultimaExecucao)}</strong></span>
                <span className="suave">· Última revisão: <strong>{fmtData(p.ultima_revisao)}</strong></span>
                {p.status === 'ativo' && revisaoVencida(p.ultima_revisao, p.periodicidade) && (
                  <Badge tom="atencao">Revisão vencida</Badge>
                )}
                {(ocorrencias ?? []).some((o) => o.status === 'em_andamento') && (
                  <Badge tom="info">
                    Ocorrência aberta: {fmtCompetencia((ocorrencias ?? []).find((o) => o.status === 'em_andamento')!.competencia)}
                  </Badge>
                )}
              </div>

              <div className="linha" style={{ marginTop: 12 }}>
                <CicloDeVida processo={p} />
                <ExcluirProcesso processo={p} />
              </div>

              <nav className="abas" aria-label="Abas do processo">
                {ABAS.map((a) => (
                  <button key={a.chave} className={`aba ${aba === a.chave ? 'ativa' : ''}`} onClick={() => setAba(a.chave)}>
                    {a.rotulo}
                  </button>
                ))}
              </nav>
            </header>

            <div className="drawer-corpo">
              {aba === 'visao-geral' && <AbaVisaoGeral processo={p} />}
              {aba === 'como-executar' && <AbaComoExecutar processo={p} />}
              {aba === 'operacao' && <AbaOperacao processo={p} />}
              {aba === 'ocorrencias' && <AbaOcorrencias processo={p} />}
              {aba === 'indicadores' && <AbaIndicadores processo={p} />}
              {aba === 'governanca' && <AbaGovernanca processo={p} />}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
