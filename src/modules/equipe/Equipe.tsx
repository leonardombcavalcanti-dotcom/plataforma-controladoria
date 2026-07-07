// Módulo Equipe — vistas Pessoas · Capacidade · Feedbacks (Etapa 4.75).
// Capacidade = carga calculada da operação real; nunca ranking (Constituição Art. 42.10).
import { useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { usePessoaAtual, usePessoas } from '../../data/queries';
import { useDemandas } from '../../data/demandas.queries';
import { useFeedbacks } from '../../data/equipe.api';
import { type Demanda, demandaAtrasada } from '../../domain/demandas';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import { CartaoFeedback } from './FichaPessoa';
import type { Pessoa } from '../../domain/tipos';

type Vista = 'pessoas' | 'capacidade' | 'feedbacks';

export function Equipe() {
  const nav = useNavigate();
  const { vista = 'pessoas' } = useParams<{ vista: Vista }>();
  const { data: pessoas, isLoading } = usePessoas();
  const { data: eu } = usePessoaAtual();
  const { data: demandas } = useDemandas();
  const { data: feedbacks } = useFeedbacks();

  const souGestor = eu?.perfil === 'gestor' || eu?.perfil === 'admin';

  const VISTAS: { chave: Vista; rotulo: string; visivel: boolean }[] = [
    { chave: 'pessoas', rotulo: 'Pessoas', visivel: true },
    { chave: 'capacidade', rotulo: 'Capacidade', visivel: souGestor || eu?.perfil === 'executivo' },
    { chave: 'feedbacks', rotulo: 'Feedbacks', visivel: true },
  ];

  const carga = useMemo(() => {
    const ativas = (demandas ?? []).filter((d) =>
      !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status));
    const porPessoa = new Map<string, { ativas: Demanda[]; horas: number }>();
    for (const d of ativas) {
      if (!d.responsavel_id) continue;
      const atual = porPessoa.get(d.responsavel_id) ?? { ativas: [], horas: 0 };
      atual.ativas.push(d);
      atual.horas += Number(d.tempo_estimado_h ?? 0);
      porPessoa.set(d.responsavel_id, atual);
    }
    return porPessoa;
  }, [demandas]);

  if (isLoading || !eu) return <Carregando linhas={4} />;

  const meusFeedbacks = (feedbacks ?? []).filter((f) => f.para_id === eu.id || f.de_id === eu.id);

  return (
    <>
      <div className="linha" style={{ marginBottom: 14 }}>
        <h1>Equipe</h1>
        <span className="mudo">{(pessoas ?? []).length} pessoa(s)</span>
      </div>

      <nav className="abas" style={{ marginBottom: 16, marginTop: 0 }} aria-label="Vistas">
        {VISTAS.filter((v) => v.visivel).map((v) => (
          <NavLink key={v.chave} to={`/equipe/${v.chave}`}
            className={({ isActive }) => `aba ${isActive ? 'ativa' : ''}`}>
            {v.rotulo}
          </NavLink>
        ))}
      </nav>

      {vista === 'pessoas' && (
        <div className="grade">
          {(pessoas ?? []).map((p) => (
            <CartaoPessoa key={p.id} p={p} pessoas={pessoas ?? []}
              onAbrir={() => nav(`/equipe/pessoas/${p.id}`)} />
          ))}
        </div>
      )}

      {vista === 'capacidade' && (
        <div className="grade">
          {(pessoas ?? []).map((p) => {
            const c = carga.get(p.id) ?? { ativas: [], horas: 0 };
            const atrasadas = c.ativas.filter(demandaAtrasada).length;
            const bloqueadas = c.ativas.filter((d) => d.status === 'bloqueada').length;
            return (
              <div key={p.id} className="cartao clicavel" onClick={() => nav(`/equipe/capacidade/${p.id}`)}
                   role="button" tabIndex={0}>
                <div className="linha">
                  <strong>{p.nome}</strong>
                  <span className="mudo">{p.cargo ?? ''}</span>
                  <div className="espaco" />
                  <Badge tom={c.ativas.length === 0 ? 'neutro' : 'info'}>{c.ativas.length} ativa(s)</Badge>
                  {c.horas > 0 && <Badge tom="neutro">{c.horas}h estimadas</Badge>}
                  {atrasadas > 0 && <Badge tom="critico">{atrasadas} atrasada(s)</Badge>}
                  {bloqueadas > 0 && <Badge tom="atencao">{bloqueadas} bloqueada(s)</Badge>}
                </div>
              </div>
            );
          })}
          <p className="mudo">
            Carga calculada das demandas ativas e horas estimadas — leitura de capacidade, nunca ranking de pessoas.
          </p>
        </div>
      )}

      {vista === 'feedbacks' && (
        meusFeedbacks.length === 0 ? (
          <EstadoVazio titulo="Nenhum feedback ainda.">
            Feedbacks que você recebe ou envia aparecem aqui, com a thread completa.
          </EstadoVazio>
        ) : (
          <div className="grade">
            {meusFeedbacks.map((f) => <CartaoFeedback key={f.id} f={f} eu={eu} />)}
          </div>
        )
      )}

      <Outlet />
    </>
  );
}

function CartaoPessoa(props: { p: Pessoa; pessoas: Pessoa[]; onAbrir: () => void }) {
  const { p } = props;
  const gestor = props.pessoas.find((x) => x.id === p.gestor_id);
  const rotuloPerfil: Record<string, string> = {
    colaborador: 'Colaborador', gestor: 'Gestor', executivo: 'Executivo', admin: 'Admin',
  };
  return (
    <div className="cartao clicavel" onClick={props.onAbrir} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && props.onAbrir()}>
      <div className="linha">
        <strong>{p.nome}</strong>
        <span className="suave">{p.cargo ?? ''}</span>
        <Badge tom="neutro">{rotuloPerfil[p.perfil] ?? p.perfil}</Badge>
        <div className="espaco" />
        {gestor && <span className="mudo">Gestor: {gestor.nome}</span>}
      </div>
    </div>
  );
}
