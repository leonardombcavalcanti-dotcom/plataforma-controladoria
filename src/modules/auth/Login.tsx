import { useState } from 'react';
import { supabase } from '../../lib/supabase';

type Modo = 'entrar' | 'solicitar' | 'enviado';

export function Login() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setEnviando(false);
    if (error) {
      setErro('Não foi possível entrar. Confira e-mail e senha, ou solicite acesso abaixo.');
    }
  }

  async function solicitar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    // Cria o login (fica sem acesso até o admin aprovar) + registra a solicitação
    const { data, error } = await supabase.auth.signUp({ email, password: senha });
    if (error && !/already registered/i.test(error.message)) {
      setEnviando(false);
      setErro('Não foi possível criar a solicitação. Verifique o e-mail e tente novamente.');
      return;
    }
    const { error: e2 } = await supabase.from('acessos_pendentes').insert({
      nome: nome.trim(), email: email.trim(), auth_user_id: data?.user?.id ?? null,
    });
    await supabase.auth.signOut();
    setEnviando(false);
    if (e2) {
      setErro('Não foi possível registrar a solicitação. Tente novamente.');
    } else {
      setModo('enviado');
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="cartao" style={{ width: 380 }}>
        <h1 style={{ marginBottom: 4 }}>
          Plataforma <span style={{ color: 'var(--cor-primaria)' }}>Controladoria</span>
        </h1>

        {modo === 'enviado' ? (
          <div style={{ marginTop: 12 }}>
            <p><strong>Solicitação enviada.</strong></p>
            <p className="suave" style={{ marginTop: 8 }}>
              O administrador vai validar seu acesso. Assim que aprovado, entre com o e-mail e a senha que você definiu.
            </p>
            <button className="btn" style={{ marginTop: 16, width: '100%' }}
                    onClick={() => setModo('entrar')}>Voltar ao login</button>
          </div>
        ) : (
          <form onSubmit={modo === 'entrar' ? entrar : solicitar}>
            <p className="suave" style={{ marginBottom: 18 }}>
              {modo === 'entrar' ? 'Entre para acessar a operação.' : 'Solicite seu acesso — o administrador aprova.'}
            </p>
            {modo === 'solicitar' && (
              <label className="campo">
                <span>Nome completo</span>
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
              </label>
            )}
            <label className="campo">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                     autoFocus={modo === 'entrar'} />
            </label>
            <label className="campo">
              <span>{modo === 'entrar' ? 'Senha' : 'Senha desejada (mín. 6 caracteres)'}</span>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} />
            </label>

            {erro && <p style={{ color: 'var(--cor-critico)', marginBottom: 12 }}>{erro}</p>}

            <button className="btn primario" style={{ width: '100%' }} disabled={enviando}>
              {enviando ? 'Enviando…' : modo === 'entrar' ? 'Entrar' : 'Solicitar acesso'}
            </button>
            <button type="button" className="btn" style={{ width: '100%', marginTop: 8 }}
                    onClick={() => { setErro(null); setModo(modo === 'entrar' ? 'solicitar' : 'entrar'); }}>
              {modo === 'entrar' ? 'Não tem acesso? Solicitar' : 'Já tenho acesso — entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
