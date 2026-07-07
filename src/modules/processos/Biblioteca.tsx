import { useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useProcessos } from '../../data/queries';
import { PERIODICIDADE, STATUS_PROCESSO, fmtData, revisaoVencida } from '../../domain/regras';
import type { Processo } from '../../domain/tipos';
import { Badge, Carregando, EstadoVazio } from '../../components/ui';
import { gravarPref, lerPref } from '../../lib/prefs';
import { BarraExcel } from './ProcessosExcel';
import { ResumoProcessos } from './ResumoProcessos';

// Biblioteca = catálogo (vista inicial do MVP — Etapa 4.75 P4).
// O Mapa da Operação visual entra na F2, com dados reais acumulados.
export function Biblioteca() {
  const nav = useNavigate();
  const { data: processos, isLoading, error } = useProcessos();

  const [busca, setBusca] = useState(() => lerPref('biblioteca.busca', ''));
  const [fStatus, setFStatus] = useState(() => lerPref('biblioteca.filtroStatus', ''));
  const [fPer, setFPer] = useState(() => lerPref('biblioteca.filtroPeriodicidade', ''));
  const [modo, setModo] = useState(() => lerPref('processos.modo', 'lista'));

  const filtrados = useMemo(() => {
    let lista = processos ?? [];
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      lista = lista.filter((p) => p.nome.toLowerCase().includes(q) || p.objetivo.toLowerCase().includes(q));
    }
    if (fStatus) lista = lista.filter((p) => p.status === fStatus);
    if (fPer) lista = lista.filter((p) => p.periodicidade === fPer);
    return lista;
  }, [processos, busca, fStatus, fPer]);

  if (error) {
    return (
      <EstadoVazio titulo="Não foi possível carregar os processos.">
        Verifique sua conexão e recarregue a página. Se persistir, confira a configuração do Supabase (.env).
      </EstadoVazio>
    );
  }

  return (
    <>
      <div className="linha" style={{ marginBottom: 12 }}>
        <h1>Biblioteca de Processos</h1>
        <span className="mudo">{processos ? `${filtrados.length} de ${processos.length}` : ''}</span>
        <div className="espaco" />
        {([['lista', 'Lista'], ['resumo', 'Resumo']] as [string, string][]).map(([k, r]) => (
          <button key={k} className={`btn mini ${modo === k ? 'primario' : ''}`}
                  onClick={() => { setModo(k); gravarPref('processos.modo', k); }}>{r}</button>
        ))}
        <BarraExcel processos={processos ?? []} />
        <button className="btn primario" onClick={() => nav('/processos/novo')}>Novo processo</button>
      </div>

      {/* Contadores do catálogo — clicáveis como filtro rápido */}
      <div className="linha" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {([['ativo', '🟢 Ativos'], ['em_construcao', '🛠 Em construção'],
           ['em_validacao', '⏳ Em validação'], ['em_revisao', '🔍 Em revisão']] as [string, string][]).map(([st, rotulo]) => {
          const n = (processos ?? []).filter((p) => p.status === st).length;
          return (
            <button key={st} className={`btn mini ${fStatus === st ? 'primario' : ''}`}
                    onClick={() => { const novo = fStatus === st ? '' : st; setFStatus(novo); gravarPref('biblioteca.filtroStatus', novo); }}>
              {rotulo} <strong>{n}</strong>
            </button>
          );
        })}
        {(() => {
          const n = (processos ?? []).filter((p) => p.status === 'ativo' && revisaoVencida(p.ultima_revisao, p.periodicidade)).length;
          return n > 0 ? <span className="badge atencao">⚠ {n} com revisão vencida</span> : null;
        })()}
      </div>

      {/* Art. 42.5: tabela/lista sempre com filtro e busca */}
      <div className="linha" style={{ marginBottom: 16 }}>
        <input
          type="text" placeholder="Buscar por nome ou objetivo…" style={{ maxWidth: 320 }}
          value={busca}
          onChange={(e) => { setBusca(e.target.value); gravarPref('biblioteca.busca', e.target.value); }}
        />
        <select value={fStatus} style={{ maxWidth: 180 }}
          onChange={(e) => { setFStatus(e.target.value); gravarPref('biblioteca.filtroStatus', e.target.value); }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_PROCESSO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <select value={fPer} style={{ maxWidth: 180 }}
          onChange={(e) => { setFPer(e.target.value); gravarPref('biblioteca.filtroPeriodicidade', e.target.value); }}>
          <option value="">Todas as periodicidades</option>
          {Object.entries(PERIODICIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {isLoading ? (
        <Carregando linhas={5} />
      ) : filtrados.length === 0 ? (
        (processos?.length ?? 0) === 0 ? (
          <EstadoVazio
            titulo="Comece pelo que se repete."
            acao={<button className="btn primario" onClick={() => nav('/processos/novo')}>Criar o primeiro processo</button>}
          >
            Cadastre o Fechamento Mensal, o Forecast ou a Conciliação — o assistente traz modelos prontos.
          </EstadoVazio>
        ) : (
          <EstadoVazio titulo="Nenhum processo com esses filtros.">Ajuste a busca ou limpe os filtros.</EstadoVazio>
        )
      ) : modo === 'resumo' ? (
        <ResumoProcessos processos={filtrados} />
      ) : (
        <div className="grade">
          {filtrados.map((p) => <CartaoProcesso key={p.id} p={p} onAbrir={() => nav(`/processos/${p.id}`)} />)}
        </div>
      )}

      {/* Ficha abre como drawer sobre a Biblioteca (ADR-24) */}
      <Outlet />
    </>
  );
}

function CartaoProcesso(props: { p: Processo; onAbrir: () => void }) {
  const { p } = props;
  const st = STATUS_PROCESSO[p.status];
  const revVencida = p.status === 'ativo' && revisaoVencida(p.ultima_revisao, p.periodicidade);
  return (
    // Art. 19: Título → Contexto → Informação → Ações (cartão inteiro clicável)
    <div className="cartao clicavel" onClick={props.onAbrir} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && props.onAbrir()}>
      <div className="linha">
        <strong>{p.nome}</strong>
        <Badge tom={st.tom}>{st.rotulo}</Badge>
        <Badge tom="neutro">{PERIODICIDADE[p.periodicidade]}</Badge>
        <span className="mudo">v{p.versao}</span>
        <div className="espaco" />
        {revVencida && <Badge tom="atencao">Revisão vencida</Badge>}
      </div>
      <p className="suave" style={{ marginTop: 6 }}>{p.objetivo}</p>
      <p className="mudo" style={{ marginTop: 6 }}>
        {p.area?.nome ?? '—'} · Dono: {p.dono?.nome ?? '—'} · Última revisão: {fmtData(p.ultima_revisao)}
      </p>
    </div>
  );
}
