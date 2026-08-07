import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePessoaAtual } from '../data/queries';
import { useDemandas } from '../data/demandas.queries';
import { demandaAtrasada } from '../domain/demandas';
import { Toasts } from './ui';
import { CommandPalette } from './CommandPalette';
import { gravarPref, lerPref } from '../lib/prefs';

export function AppShell(props: { children: ReactNode }) {
  const nav = useNavigate();
  const { data: pessoa, isLoading: carregandoPessoa } = usePessoaAtual();
  const { data: demandas } = useDemandas();
  const [paleta, setPaleta] = useState(false);
  const [criarAberto, setCriarAberto] = useState(false);
  const [tema, setTema] = useState(() => lerPref('tema', 'claro'));
  const [fechada, setFechada] = useState(() => lerPref('sidebar', 'aberta') === 'fechada');
  const [zoom, setZoom] = useState(() => lerPref('zoom', '100'));
  const [atualizando, setAtualizando] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);

  // Puxa a última versão publicada: limpa caches, atualiza o SW e recarrega.
  async function atualizarApp() {
    setAtualizando(true);
    try {
      if ('caches' in window) {
        const nomes = await caches.keys();
        await Promise.all(nomes.map((n) => caches.delete(n)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update()));
      }
    } catch { /* segue para o reload mesmo assim */ }
    window.location.reload();
  }

  useEffect(() => {
    if (tema === 'claro') delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = tema;
    gravarPref('tema', tema);
  }, [tema]);

  useEffect(() => {
    (document.body.style as unknown as { zoom: string }).zoom = `${Number(zoom) / 100}`;
    gravarPref('zoom', zoom);
  }, [zoom]);

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaleta((v) => !v);
      }
    };
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  // Pendências do dia (badge vermelho no item Central de Trabalho)
  const pendencias = useMemo(() => {
    if (!pessoa || !demandas) return 0;
    const hoje = new Date().toISOString().slice(0, 10);
    const souGestor = pessoa.perfil === 'gestor' || pessoa.perfil === 'admin';
    return demandas.filter((d) => {
      const minhaAtiva = d.responsavel_id === pessoa.id &&
        !['concluida', 'encerrada', 'rejeitada', 'solicitada'].includes(d.status);
      if (minhaAtiva && (demandaAtrasada(d) || d.status === 'bloqueada' || d.prazo <= hoje)) return true;
      if (d.status === 'em_validacao' && (d.validador_id ?? d.criador_id) === pessoa.id) return true;
      if (d.status === 'solicitada' && !d.devolvida &&
          (d.aprovador_id === pessoa.id || (d.aprovador_id === null && souGestor))) return true;
      if (d.status === 'solicitada' && d.devolvida && d.criador_id === pessoa.id) return true;
      if (souGestor && d.status === 'concluida' && d.avaliacao_nota === null &&
          (d.responsavel_id !== pessoa.id || pessoa.perfil === 'admin')) return true;
      return false;
    }).length;
  }, [pessoa, demandas]);

  if (!carregandoPessoa && !pessoa) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="cartao" style={{ width: 420 }}>
          <h1 style={{ marginBottom: 8 }}>Acesso em análise</h1>
          <p className="suave" style={{ marginBottom: 16 }}>
            Seu login existe, mas ainda não foi aprovado pelo administrador.
            Assim que a solicitação for validada, é só entrar novamente.
          </p>
          <button className="btn" onClick={() => void supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    );
  }

  const Item = (p: { para: string; icone: string; rotulo: string; badge?: number }) => (
    <NavLink to={p.para} title={p.rotulo}
      className={({ isActive }) => `nav-item ${isActive ? 'ativo' : ''}`}>
      <span style={{ position: 'relative' }}>
        {p.icone}
        {(p.badge ?? 0) > 0 && fechada && <span className="ponto-alerta" style={{ position: 'absolute', top: -6, right: -10 }}>{p.badge}</span>}
      </span>
      {!fechada && <span className="rotulo">{p.rotulo}</span>}
      {!fechada && (p.badge ?? 0) > 0 && <span className="ponto-alerta">{p.badge}</span>}
    </NavLink>
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${fechada ? 'fechada' : ''}`}>
        <div className="linha" style={{ padding: '0 4px 14px' }}>
          {!fechada && (
            <div className="marca" style={{ padding: 0 }}>
              Plataforma <span>Controladoria</span>
            </div>
          )}
          <div className="espaco" />
          <button className="btn mini" title={fechada ? 'Expandir menu' : 'Recolher menu'}
                  style={{ background: 'transparent', borderColor: 'transparent', color: 'var(--sidebar-texto)' }}
                  onClick={() => { const v = !fechada; setFechada(v); gravarPref('sidebar', v ? 'fechada' : 'aberta'); }}>
            {fechada ? '»' : '«'}
          </button>
        </div>
        <nav aria-label="Módulos">
          <Item para="/central" icone="🏠" rotulo="Central de Trabalho" badge={pendencias} />
          <Item para="/demandas" icone="📋" rotulo="Demandas" />
          <Item para="/processos" icone="⚙️" rotulo="Processos" />
          <Item para="/equipe" icone="👥" rotulo="Equipe" />
          <Item para="/indicadores" icone="📊" rotulo="Indicadores" />
          <Item para="/calendario" icone="📅" rotulo="Calendário" />
          {pessoa?.perfil === 'admin' && <Item para="/admin" icone="⚙" rotulo="Administração" />}
        </nav>
        {!fechada && (
          <div className="rodape">
            Menu congelado completo — 8 módulos no ar.<br />
            Versão de {new Date(__BUILD__).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </aside>

      <div className="principal">
        <header className="topbar">
          <button className="btn mini busca-global" onClick={() => setPaleta(true)}>
            🔍 <span className="busca-texto">Buscar…  <span className="mono" style={{ float: 'right' }}>Ctrl+K</span></span>
          </button>
          <div className="espaco" />
          <div style={{ position: 'relative' }}>
            <button className="btn mini primario" onClick={() => setCriarAberto(!criarAberto)}>+ Criar</button>
            {criarAberto && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setCriarAberto(false)} />
                <div className="cartao" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 31,
                     width: 200, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(pessoa?.perfil === 'gestor' || pessoa?.perfil === 'admin'
                    ? [['Nova demanda', '/demandas/nova'], ['Nova solicitação', '/demandas/solicitar'],
                       ['Novo processo', '/processos/novo']]
                    : [['Nova solicitação', '/demandas/solicitar'], ['Novo processo', '/processos/novo']]
                  ).map(([r, rota]) => (
                    <button key={rota} className="nav-item"
                            onClick={() => { setCriarAberto(false); nav(rota); }}>{r}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <select value={zoom} onChange={(e) => setZoom(e.target.value)} aria-label="Zoom da interface"
                  title="Ajuste o zoom à sua tela"
                  style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}>
            <option value="70">🔍 70%</option>
            <option value="80">🔍 80%</option>
            <option value="90">🔍 90%</option>
            <option value="100">🔍 100%</option>
            <option value="110">🔍 110%</option>
            <option value="125">🔍 125%</option>
          </select>
          <select value={tema} onChange={(e) => setTema(e.target.value)} aria-label="Tema visual"
                  style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}>
            <option value="claro">◻ Claro</option>
            <option value="escuro">◼ Escuro</option>
            <option value="dourado">◆ Dourado & Preto</option>
          </select>
          <button className="btn mini" onClick={() => void atualizarApp()} disabled={atualizando}
                  title={`Atualizar para a última versão publicada (build de ${new Date(__BUILD__).toLocaleString('pt-BR')})`}
                  aria-label="Atualizar app">
            {atualizando ? '…' : '⟳'}
          </button>
          <div className="usuario">
            {pessoa ? (
              <>
                <span>{pessoa.nome}{pessoa.cargo ? ` · ${pessoa.cargo}` : ''}</span>
                <button className="btn mini" onClick={() => void supabase.auth.signOut()}>Sair</button>
              </>
            ) : (
              <span className="mudo">—</span>
            )}
          </div>
        </header>
        <main className="conteudo">{props.children}</main>
      </div>
      {/* Navegação mobile (PWA): barra inferior estilo app */}
      <nav className="nav-mobile" aria-label="Navegação">
        <NavLink to="/central" className={({ isActive }) => isActive ? 'ativo' : ''}>
          <span style={{ position: 'relative' }}>🏠
            {pendencias > 0 && <span className="ponto-alerta" style={{ position: 'absolute', top: -6, right: -14 }}>{pendencias}</span>}
          </span>
          <span>Central</span>
        </NavLink>
        <NavLink to="/demandas" className={({ isActive }) => isActive ? 'ativo' : ''}>
          <span>📋</span><span>Demandas</span>
        </NavLink>
        <NavLink to="/processos" className={({ isActive }) => isActive ? 'ativo' : ''}>
          <span>⚙️</span><span>Processos</span>
        </NavLink>
        <NavLink to="/equipe" className={({ isActive }) => isActive ? 'ativo' : ''}>
          <span>👥</span><span>Equipe</span>
        </NavLink>
        <NavLink to="/indicadores" className={({ isActive }) => isActive ? 'ativo' : ''}>
          <span>📊</span><span>Indicad.</span>
        </NavLink>
        <NavLink to="/calendario" className={({ isActive }) => isActive ? 'ativo' : ''}>
          <span>📅</span><span>Agenda</span>
        </NavLink>
        <button className={maisAberto ? 'ativo' : ''} onClick={() => setMaisAberto(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <span>⚙︎</span><span>Mais</span>
        </button>
      </nav>

      {/* Folha "Mais" (mobile): tema, zoom, administração, atualizar, sair */}
      {maisAberto && (
        <>
          <div className="drawer-fundo" style={{ zIndex: 44 }} onClick={() => setMaisAberto(false)} />
          <div className="sheet-mobile" role="dialog" aria-label="Configurações">
            <div className="linha" style={{ marginBottom: 4 }}>
              <strong>{pessoa?.nome}</strong>
              <span className="mudo">{pessoa?.cargo ?? ''}</span>
              <div className="espaco" />
              <button className="btn mini" onClick={() => setMaisAberto(false)}>✕</button>
            </div>

            <div className="mudo" style={{ fontSize: 12, fontWeight: 600 }}>Tema do ambiente</div>
            <div className="linha" style={{ flexWrap: 'wrap' }}>
              {([['claro', '◻ Claro'], ['escuro', '◼ Escuro'], ['dourado', '◆ Dourado']] as [string, string][]).map(([k, r]) => (
                <button key={k} className={`btn mini ${tema === k ? 'primario' : ''}`}
                        onClick={() => setTema(k)}>{r}</button>
              ))}
            </div>

            <div className="mudo" style={{ fontSize: 12, fontWeight: 600 }}>Zoom da interface</div>
            <div className="linha" style={{ flexWrap: 'wrap' }}>
              {['70', '80', '90', '100', '110'].map((z) => (
                <button key={z} className={`btn mini ${zoom === z ? 'primario' : ''}`}
                        onClick={() => setZoom(z)}>{z}%</button>
              ))}
            </div>

            {pessoa?.perfil === 'admin' && (
              <button className="btn" style={{ width: '100%' }}
                      onClick={() => { setMaisAberto(false); nav('/admin'); }}>
                ⚙ Administração
              </button>
            )}
            <button className="btn" style={{ width: '100%' }} disabled={atualizando}
                    onClick={() => void atualizarApp()}>
              ⟳ Atualizar app
              <span className="mudo" style={{ marginLeft: 8, fontSize: 11 }}>
                (versão de {new Date(__BUILD__).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})
              </span>
            </button>
            <button className="btn perigo" style={{ width: '100%' }}
                    onClick={() => void supabase.auth.signOut()}>
              Sair
            </button>
          </div>
        </>
      )}
      <Toasts />
      <CommandPalette aberta={paleta} onFechar={() => setPaleta(false)} />
    </div>
  );
}
