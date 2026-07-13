// Administração — Estrutura · Pessoas & Acessos · Auditoria (Etapa 3 §2.6).
// Visível apenas para admin; a escrita é garantida por RLS, não pelo front.
import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useAreas, usePessoaAtual, usePessoas } from '../../data/queries';
import {
  type PessoaInput, useAcessosPendentes, useAdminMutations, useEventosGlobais, useTenant,
} from '../../data/admin.api';
import { fmtDataHora } from '../../domain/regras';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import type { PerfilAcesso, Pessoa } from '../../domain/tipos';

type Vista = 'estrutura' | 'pessoas' | 'auditoria';

const PERFIS: Record<PerfilAcesso, string> = {
  colaborador: 'Colaborador', gestor: 'Gestor', executivo: 'Executivo', admin: 'Admin',
};

export function Administracao() {
  const { vista = 'estrutura' } = useParams<{ vista: Vista }>();
  const { data: eu } = usePessoaAtual();

  if (!eu) return <Carregando linhas={4} />;
  if (eu.perfil !== 'admin') {
    return (
      <EstadoVazio titulo="Área restrita ao administrador.">
        Peça a um admin do tenant para ajustar seu perfil, se necessário.
      </EstadoVazio>
    );
  }

  return (
    <>
      <div className="linha" style={{ marginBottom: 14 }}>
        <h1>Administração</h1>
      </div>
      <nav className="abas" style={{ marginBottom: 16, marginTop: 0 }} aria-label="Vistas">
        {([['estrutura', 'Estrutura'], ['pessoas', 'Pessoas & Acessos'], ['auditoria', 'Auditoria']] as [Vista, string][]).map(([k, r]) => (
          <NavLink key={k} to={`/admin/${k}`}
            className={({ isActive }) => `aba ${isActive ? 'ativa' : ''}`}>{r}</NavLink>
        ))}
      </nav>

      {vista === 'estrutura' && <VistaEstrutura />}
      {vista === 'pessoas' && <VistaPessoas />}
      {vista === 'auditoria' && <VistaAuditoria />}
    </>
  );
}

// ---------- ESTRUTURA ----------
function VistaEstrutura() {
  const { data: tenant } = useTenant();
  const { data: areas } = useAreas();
  const m = useAdminMutations();
  const [nomeEmpresa, setNomeEmpresa] = useState<string | null>(null);
  const [novaArea, setNovaArea] = useState('');
  const [editandoArea, setEditandoArea] = useState<{ id: string; nome: string } | null>(null);

  if (!tenant) return <Carregando linhas={3} />;

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="cartao secao">
        <h3 style={{ marginBottom: 10 }}>Empresa</h3>
        <div className="linha">
          <input type="text" value={nomeEmpresa ?? tenant.nome}
                 onChange={(e) => setNomeEmpresa(e.target.value)} />
          <button className="btn primario mini"
                  disabled={nomeEmpresa === null || nomeEmpresa.trim() === tenant.nome || m.renomearTenant.isPending}
                  onClick={() => m.renomearTenant.mutate({ id: tenant.id, nome: (nomeEmpresa ?? '').trim() })}>
            Salvar
          </button>
        </div>
      </div>

      <div className="cartao secao">
        <h3 style={{ marginBottom: 10 }}>Áreas</h3>
        <ul className="lista-limpa grade">
          {(areas ?? []).map((a) => (
            <li key={a.id} className="linha">
              {editandoArea?.id === a.id ? (
                <>
                  <input type="text" value={editandoArea.nome}
                         onChange={(e) => setEditandoArea({ id: a.id, nome: e.target.value })} />
                  <button className="btn mini primario" disabled={!editandoArea.nome.trim()}
                          onClick={() => { m.renomearArea.mutate({ id: a.id, nome: editandoArea.nome.trim() }); setEditandoArea(null); }}>
                    Salvar
                  </button>
                  <button className="btn mini" onClick={() => setEditandoArea(null)}>Cancelar</button>
                </>
              ) : (
                <>
                  <span>{a.nome}</span>
                  <div className="espaco" />
                  <button className="btn mini" onClick={() => setEditandoArea({ id: a.id, nome: a.nome })}>
                    Renomear
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="linha" style={{ marginTop: 12 }}>
          <input type="text" placeholder="Nova área (ex.: Fiscal, Tesouraria)…" value={novaArea}
                 onChange={(e) => setNovaArea(e.target.value)} />
          <button className="btn primario mini" disabled={!novaArea.trim() || m.criarArea.isPending}
                  onClick={() => { m.criarArea.mutate({ tenantId: tenant.id, nome: novaArea.trim() }); setNovaArea(''); }}>
            Adicionar
          </button>
        </div>
        <p className="mudo" style={{ marginTop: 10 }}>
          Unidades e centros de resultado entram quando os módulos que os consomem existirem.
        </p>
      </div>
    </div>
  );
}

// ---------- PESSOAS & ACESSOS ----------
interface PessoaComVinculo extends Pessoa { auth_user_id?: string | null }

function VistaPessoas() {
  const { data: pessoas } = usePessoas();
  const { data: areas } = useAreas();
  const { data: eu } = usePessoaAtual();
  const { data: tenant } = useTenant();
  const m = useAdminMutations();
  const [editando, setEditando] = useState<PessoaComVinculo | 'nova' | null>(null);

  const lista = (pessoas ?? []) as PessoaComVinculo[];

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="cartao secao" style={{ borderLeft: '3px solid var(--cor-atencao)' }}>
        <p className="suave">
          ⚠ <strong>Segregação de funções:</strong> recomendamos que o administrador não exerça funções
          operacionais. Em equipes pequenas o acúmulo é aceitável — registre a exceção com a diretoria.
        </p>
      </div>

      {tenant && eu && <AcessosPendentesBloco tenantId={tenant.id} euId={eu.id} />}

      <div className="linha" style={{ marginBottom: 12 }}>
        <span className="mudo">{lista.length} pessoa(s)</span>
        <div className="espaco" />
        <button className="btn primario" onClick={() => setEditando('nova')}>Nova pessoa</button>
      </div>

      <div className="grade">
        {lista.map((p) => (
          <div key={p.id} className="cartao clicavel" onClick={() => setEditando(p)} role="button" tabIndex={0}>
            <div className="linha">
              <strong>{p.nome}</strong>
              <span className="suave">{p.cargo ?? ''}</span>
              <Badge tom={p.perfil === 'admin' ? 'atencao' : 'neutro'}>{PERFIS[p.perfil]}</Badge>
              {!p.ativa && <Badge tom="critico">Desativada</Badge>}
              {!p.auth_user_id && p.ativa && <Badge tom="atencao">Sem login vinculado</Badge>}
              <div className="espaco" />
              <span className="mudo">
                {(areas ?? []).find((a) => a.id === p.area_id)?.nome ?? '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {editando && tenant && eu && (
        <FormPessoa
          pessoa={editando === 'nova' ? null : editando}
          pessoas={lista} areas={areas ?? []} euId={eu.id}
          onFechar={() => setEditando(null)}
          onExcluir={(id) => { m.excluirPessoa.mutate(id); setEditando(null); }}
          onSalvar={(dados) => {
            if (editando === 'nova') m.criarPessoa.mutate({ tenantId: tenant.id, pessoa: dados });
            else m.atualizarPessoa.mutate({ id: editando.id, pessoa: dados });
            setEditando(null);
          }} />
      )}
    </div>
  );
}

function FormPessoa(props: {
  pessoa: PessoaComVinculo | null;
  pessoas: PessoaComVinculo[];
  areas: { id: string; nome: string }[];
  euId: string;
  onFechar: () => void;
  onSalvar: (p: PessoaInput) => void;
  onExcluir?: (id: string) => void;
}) {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const { pessoa } = props;
  const [nome, setNome] = useState(pessoa?.nome ?? '');
  const [email, setEmail] = useState((pessoa as { email?: string | null } | null)?.email ?? '');
  const [cargo, setCargo] = useState(pessoa?.cargo ?? '');
  const [perfil, setPerfil] = useState<PerfilAcesso>(pessoa?.perfil ?? 'colaborador');
  const [gestorId, setGestorId] = useState(pessoa?.gestor_id ?? '');
  const [areaId, setAreaId] = useState(pessoa?.area_id ?? '');
  const [ativa, setAtiva] = useState(pessoa?.ativa ?? true);
  const souEu = pessoa?.id === props.euId;

  return (
    <div className="modal-fundo" onClick={props.onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 92vw)' }}>
        <h2>{pessoa ? `Editar ${pessoa.nome}` : 'Nova pessoa'}</h2>
        {pessoa && !pessoa.auth_user_id && (
          <p className="suave" style={{ marginTop: 6 }}>
            Sem login vinculado: crie o usuário em Authentication → Add user e rode no SQL Editor:{' '}
            <span className="mono">update pessoas set auth_user_id = (select id from auth.users where email = 'EMAIL') where id = '{pessoa.id}';</span>
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <label className="campo"><span>Nome</span>
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></label>
          <label className="campo"><span>E-mail (para os relatórios automáticos)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="nome@asalocadora.com.br" /></label>
          <div className="grade" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="campo"><span>Cargo</span>
              <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} /></label>
            <label className="campo"><span>Perfil de acesso (ADR-18)</span>
              <select value={perfil} disabled={souEu}
                      onChange={(e) => setPerfil(e.target.value as PerfilAcesso)}>
                {Object.entries(PERFIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="campo"><span>Gestor direto</span>
              <select value={gestorId} onChange={(e) => setGestorId(e.target.value)}>
                <option value="">—</option>
                {props.pessoas.filter((x) => x.id !== pessoa?.id).map((x) => (
                  <option key={x.id} value={x.id}>{x.nome}</option>
                ))}
              </select></label>
            <label className="campo"><span>Área</span>
              <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">—</option>
                {props.areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select></label>
          </div>
          <label className="linha" style={{ cursor: souEu ? 'default' : 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={ativa} disabled={souEu}
                   onChange={(e) => setAtiva(e.target.checked)} />
            <span>Ativa</span>
          </label>
        </div>
        <div className="acoes">
          {props.pessoa && !souEu && props.onExcluir && (
            <button className="btn perigo" style={{ marginRight: 'auto' }}
                    onClick={() => confirmandoExclusao
                      ? props.onExcluir!(props.pessoa!.id)
                      : setConfirmandoExclusao(true)}>
              {confirmandoExclusao ? 'Confirmar exclusão definitiva' : 'Excluir'}
            </button>
          )}
          <button className="btn" onClick={props.onFechar}>Cancelar</button>
          <button className="btn primario" disabled={!nome.trim()}
                  onClick={() => props.onSalvar({
                    nome: nome.trim(), email: email.trim() || null, cargo: cargo.trim() || null, perfil,
                    gestor_id: gestorId || null, area_id: areaId || null, ativa,
                  })}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- AUDITORIA ----------
function VistaAuditoria() {
  const { data: eventos, isLoading } = useEventosGlobais();
  const [fObjeto, setFObjeto] = useState('');
  const [fTipo, setFTipo] = useState('');

  const filtrados = useMemo(() => {
    let lista = eventos ?? [];
    if (fObjeto) lista = lista.filter((e) => e.objeto_tipo === fObjeto);
    if (fTipo) lista = lista.filter((e) => e.tipo === fTipo);
    return lista;
  }, [eventos, fObjeto, fTipo]);

  const objetos = useMemo(() => [...new Set((eventos ?? []).map((e) => e.objeto_tipo))], [eventos]);
  const tipos = useMemo(() => [...new Set((eventos ?? []).map((e) => e.tipo))], [eventos]);

  if (isLoading) return <Carregando linhas={6} />;

  return (
    <>
      <div className="linha" style={{ marginBottom: 12 }}>
        <select value={fObjeto} onChange={(e) => setFObjeto(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">Todos os objetos</option>
          {objetos.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todas as ações</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="mudo">{filtrados.length} de {(eventos ?? []).length} (últimos 300)</span>
      </div>

      <ul className="lista-limpa">
        {filtrados.map((e) => (
          <li key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)' }}>
            <div className="linha">
              <Badge tom="neutro">{e.objeto_tipo}</Badge>
              <strong>{e.tipo}</strong>
              <span className="suave" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
                {e.dados ? JSON.stringify(e.dados) : ''}
              </span>
              <div className="espaco" />
              <span className="mudo">{e.autor?.nome ?? 'Sistema'} · {fmtDataHora(e.criado_em)}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mudo" style={{ marginTop: 10 }}>
        Log imutável: nenhum perfil — nem o admin — edita ou apaga eventos (Etapa 3, regra transversal 2).
      </p>
    </>
  );
}


// ---------- SOLICITAÇÕES DE ACESSO (Sprint 09) ----------
function AcessosPendentesBloco(props: { tenantId: string; euId: string }) {
  const { data: acessos } = useAcessosPendentes();
  const m = useAdminMutations();
  const pendentes = (acessos ?? []).filter((a) => a.status === 'pendente');
  if (pendentes.length === 0) return null;
  return (
    <div className="cartao secao" style={{ borderLeft: '3px solid var(--cor-primaria)' }}>
      <h3 style={{ marginBottom: 10 }}>Solicitações de acesso ({pendentes.length})</h3>
      <ul className="lista-limpa grade">
        {pendentes.map((a) => (
          <li key={a.id} className="linha" style={{ flexWrap: 'wrap' }}>
            <strong>{a.nome}</strong>
            <span className="suave">{a.email}</span>
            <div className="espaco" />
            <button className="btn mini primario" disabled={m.aprovarAcesso.isPending}
                    onClick={() => m.aprovarAcesso.mutate({ acesso: a, tenantId: props.tenantId, decididoPor: props.euId })}>
              Aprovar como colaborador
            </button>
            <button className="btn mini perigo" disabled={m.rejeitarAcesso.isPending}
                    onClick={() => m.rejeitarAcesso.mutate({ id: a.id, decididoPor: props.euId })}>
              Rejeitar
            </button>
          </li>
        ))}
      </ul>
      <p className="mudo" style={{ marginTop: 8 }}>
        Aprovado entra como Colaborador sem área — ajuste perfil, gestor e área no cartão da pessoa.
      </p>
    </div>
  );
}
