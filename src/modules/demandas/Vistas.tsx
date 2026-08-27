import { useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useDemandas } from '../../data/demandas.queries';
import { usePessoaAtual } from '../../data/queries';
import {
  type Demanda, STATUS_DEMANDA, PRIORIDADE, demandaAtrasada, ehSubstituicao, prazoTom,
} from '../../domain/demandas';
import { fmtData } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import { Solicitacoes } from './Solicitacoes';
import { HistoricoDemandas } from './Historico';

type Vista = 'inbox' | 'minhas' | 'equipe' | 'observando' | 'solicitacoes' | 'historico' | 'arquivadas';

const VISTAS: { chave: Vista; rotulo: string }[] = [
  { chave: 'inbox', rotulo: 'Inbox' },
  { chave: 'minhas', rotulo: 'Minhas' },
  { chave: 'equipe', rotulo: 'Equipe' },
  { chave: 'observando', rotulo: 'Observando' },
  { chave: 'solicitacoes', rotulo: 'Solicitações' },
  { chave: 'historico', rotulo: 'Histórico (avulsas)' },
  { chave: 'arquivadas', rotulo: 'Encerradas' },
];

export function VistasDemandas() {
  const nav = useNavigate();
  const { vista = 'inbox' } = useParams<{ vista: Vista }>();
  const { data: demandas, isLoading, error } = useDemandas();
  const { data: eu } = usePessoaAtual();
  const ehGestor = eu?.perfil === 'gestor' || eu?.perfil === 'admin';

  const filtradas = useMemo(() => {
    const lista = demandas ?? [];
    if (!eu) return [];
    const minhaId = eu.id;
    const souGestor = eu.perfil === 'gestor' || eu.perfil === 'admin';
    const ativas = (d: Demanda) =>
      !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status);
    switch (vista) {
      case 'inbox':
        return lista.filter((d) =>
          (d.responsavel_id === minhaId && ativas(d) &&
            (d.status === 'aberta' || d.status === 'bloqueada' || demandaAtrasada(d))) ||
          (d.status === 'em_validacao' && (d.validador_id ?? d.criador_id) === minhaId) ||
          (d.status === 'solicitada' && !d.devolvida && (d.aprovador_id === minhaId || (d.aprovador_id === null && souGestor))) ||
          (d.status === 'solicitada' && d.devolvida && d.criador_id === minhaId));
      case 'minhas':
        return lista.filter((d) => d.responsavel_id === minhaId && ativas(d));
      case 'equipe':
        return lista.filter(ativas);
      case 'observando':
        return lista.filter((d) => d.criador_id === minhaId && d.responsavel_id !== minhaId && ativas(d));
      case 'arquivadas':
        return lista.filter((d) => ['concluida', 'encerrada'].includes(d.status));
      default:
        return lista;
    }
  }, [demandas, eu, vista]);

  if (error) {
    return (
      <EstadoVazio titulo="Não foi possível carregar as demandas.">
        Verifique sua conexão e recarregue a página. Se persistir, confira se as migrations 0002/0003 foram aplicadas.
      </EstadoVazio>
    );
  }

  return (
    <>
      <div className="linha" style={{ marginBottom: 14 }}>
        <h1>Demandas</h1>
        <div className="espaco" />
        {ehGestor ? (
          <button className="btn primario" onClick={() => nav('/demandas/nova')}>Nova demanda</button>
        ) : (
          <button className="btn primario" onClick={() => nav('/demandas/solicitar')}>Nova solicitação</button>
        )}
      </div>

      <nav className="abas" style={{ marginBottom: 16, marginTop: 0 }} aria-label="Vistas">
        {VISTAS.map((v) => (
          <NavLink key={v.chave} to={`/demandas/${v.chave}`}
            className={({ isActive }) => `aba ${isActive ? 'ativa' : ''}`}>
            {v.rotulo}
          </NavLink>
        ))}
      </nav>

      {vista === 'solicitacoes' ? (
        <Solicitacoes />
      ) : vista === 'historico' ? (
        <HistoricoDemandas somenteAvulsas />
      ) : isLoading ? (
        <Carregando linhas={5} />
      ) : filtradas.length === 0 ? (
        <EstadoVazioDaVista vista={vista} onCriar={() => nav('/demandas/nova')} />
      ) : (
        <div className="grade">
          {filtradas.map((d) => (
            <CartaoDemanda key={d.id} d={d} onAbrir={() => nav(`/demandas/${vista}/${d.id}`)} />
          ))}
        </div>
      )}

      <Outlet />
    </>
  );
}

function EstadoVazioDaVista(props: { vista: Vista; onCriar: () => void }) {
  switch (props.vista) {
    case 'inbox':
      return <EstadoVazio titulo="🎉 Nada aguardando você agora.">Quando algo precisar da sua ação — demanda, validação ou aprovação — aparece aqui primeiro.</EstadoVazio>;
    case 'minhas':
      return (
        <EstadoVazio titulo="Você está sem demandas ativas."
          acao={<button className="btn primario" onClick={props.onCriar}>Criar demanda</button>}>
          Crie uma demanda ou gere a ocorrência de um processo ativo.
        </EstadoVazio>
      );
    case 'equipe':
      return <EstadoVazio titulo="A área está sem demandas ativas.">As demandas de toda a área aparecem aqui, em leitura.</EstadoVazio>;
    case 'observando':
      return <EstadoVazio titulo="Você não está observando nenhuma demanda.">Ao delegar ou criar para outra pessoa, você acompanha por aqui.</EstadoVazio>;
    default:
      return <EstadoVazio titulo="Nenhuma demanda finalizada ainda." />;
  }
}

function CartaoDemanda(props: { d: Demanda; onAbrir: () => void }) {
  const { d } = props;
  const st = STATUS_DEMANDA[d.status];
  const pr = PRIORIDADE[d.prioridade];
  const tomPrazo = prazoTom(d);
  return (
    <div className="cartao clicavel" onClick={props.onAbrir} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && props.onAbrir()}>
      <div className="linha">
        <strong>{d.titulo}</strong>
        <Badge tom={st.tom}>{st.rotulo}</Badge>
        {d.status === 'solicitada' && d.devolvida && <Badge tom="atencao">Devolvida</Badge>}
        {d.prioridade !== 'media' && <Badge tom={pr.tom}>{pr.rotulo}</Badge>}
        {d.avaliacao_comentario && <Badge tom="info">comentada</Badge>}
        {ehSubstituicao(d) && <Badge tom="atencao">🔄 substituição</Badge>}
        <div className="espaco" />
        <Badge tom={tomPrazo}>
          {tomPrazo === 'critico' ? 'Atrasada · ' : ''}{fmtData(d.prazo)}
        </Badge>
      </div>
      <p className="mudo" style={{ marginTop: 6 }}>
        {d.processo?.nome ? `${d.processo.nome} · ` : 'Avulsa · '}
        {d.status === 'solicitada'
          ? `Solicitante: ${d.criador?.nome ?? '—'} · aguardando aprovação`
          : `Responsável: ${d.responsavel?.nome ?? '—'}`}
        {d.retrabalho > 0 ? ` · retrabalho ×${d.retrabalho}` : ''}
      </p>
    </div>
  );
}
