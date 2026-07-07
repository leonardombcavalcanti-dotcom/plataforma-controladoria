import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Falha explícita e orientadora (Art. 10 da Constituição)
  throw new Error(
    'Configuração ausente: crie um arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example).'
  );
}

export const supabase = createClient(url, anonKey);
