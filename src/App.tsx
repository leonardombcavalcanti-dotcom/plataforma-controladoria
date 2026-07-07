import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AppShell } from './components/layout';
import { Login } from './modules/auth/Login';
import { Central } from './modules/central/Central';
import { Biblioteca } from './modules/processos/Biblioteca';
import { FichaProcesso } from './modules/processos/FichaProcesso';
import { Assistente } from './modules/processos/Assistente';
import { VistasDemandas } from './modules/demandas/Vistas';
import { FichaDemanda } from './modules/demandas/FichaDemanda';
import { NovaDemanda } from './modules/demandas/NovaDemanda';
import { Equipe } from './modules/equipe/Equipe';
import { FichaPessoa } from './modules/equipe/FichaPessoa';
import { Calendario } from './modules/calendario/Calendario';
import { Administracao } from './modules/admin/Administracao';
import { Indicadores } from './modules/indicadores/Indicadores';
import { Carregando } from './components/ui';

export function App() {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (carregando) {
    return <div style={{ padding: 48 }}><Carregando linhas={3} /></div>;
  }

  if (!sessao) return <Login />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/central" replace />} />
        <Route path="/central" element={<Central />} />
        <Route path="/demandas" element={<Navigate to="/demandas/inbox" replace />} />
        <Route path="/demandas/nova" element={<NovaDemanda />} />
        <Route path="/demandas/solicitar" element={<NovaDemanda solicitacao />} />
        <Route path="/demandas/:vista" element={<VistasDemandas />}>
          <Route path=":id" element={<FichaDemanda />} />
        </Route>
        <Route path="/equipe" element={<Navigate to="/equipe/pessoas" replace />} />
        <Route path="/equipe/:vista" element={<Equipe />}>
          <Route path=":id" element={<FichaPessoa />} />
        </Route>
        <Route path="/calendario" element={<Navigate to="/calendario/meu" replace />} />
        <Route path="/calendario/:vista" element={<Calendario />} />
        <Route path="/indicadores" element={<Navigate to="/indicadores/operacao" replace />} />
        <Route path="/indicadores/:vista" element={<Indicadores />} />
        <Route path="/admin" element={<Navigate to="/admin/estrutura" replace />} />
        <Route path="/admin/:vista" element={<Administracao />} />
        <Route path="/processos" element={<Biblioteca />}>
          <Route path=":id" element={<FichaProcesso />} />
        </Route>
        <Route path="/processos/novo" element={<Assistente />} />
        <Route path="*" element={<Navigate to="/central" replace />} />
      </Routes>
    </AppShell>
  );
}
