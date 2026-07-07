// localStorage: EXCLUSIVAMENTE preferências visuais do usuário.
// Dados operacionais moram no Supabase — decisão do product owner (06/07/2026).

const PREFIXO = 'plataforma.ui.';

type Prefs = {
  'tema': string;
  'sidebar': string;
  'processos.modo': string;
  'biblioteca.filtroStatus': string;       // '' = todos
  'biblioteca.filtroPeriodicidade': string;
  'biblioteca.busca': string;
};

export function lerPref<K extends keyof Prefs>(chave: K, padrao: Prefs[K]): Prefs[K] {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    return (v ?? padrao) as Prefs[K];
  } catch {
    return padrao;
  }
}

export function gravarPref<K extends keyof Prefs>(chave: K, valor: Prefs[K]): void {
  try {
    localStorage.setItem(PREFIXO + chave, valor);
  } catch {
    /* preferência é descartável */
  }
}
