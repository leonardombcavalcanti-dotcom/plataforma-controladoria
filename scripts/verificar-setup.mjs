// Verificação do setup Supabase — Sprint 01
// Uso: node scripts/verificar-setup.mjs  (lê o .env da raiz do projeto)
// Testa: migration aplicada · RLS ativa · RPCs existentes · dados mínimos.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// --- lê .env sem dependências ---
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || url.includes('SEU-PROJETO') || !key || key.includes('SUA-ANON')) {
  console.log('✗ .env ainda não preenchido com URL e anon key reais.');
  process.exit(1);
}

const sb = createClient(url, key);
const resultados = [];
const ok = (nome, detalhe = '') => resultados.push(['✓', nome, detalhe]);
const falha = (nome, detalhe = '') => resultados.push(['✗', nome, detalhe]);

// 1. Tabelas existem (migration aplicada) — anon sem sessão deve receber
//    lista VAZIA (RLS filtrando), nunca erro de "relation does not exist".
const tabelas = ['tenants', 'areas', 'pessoas', 'processos', 'processo_artefatos',
  'processo_recorrencia', 'processo_relacoes', 'processo_versoes', 'ocorrencias', 'eventos'];
for (const t of tabelas) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  if (error) falha(`Tabela ${t}`, error.message);
  else if (data.length > 0) falha(`RLS em ${t}`, 'anon SEM login conseguiu ler dados — política vazando!');
  else ok(`Tabela ${t}`, 'existe; RLS bloqueia anon');
}

// 2. RPCs existem e validam (esperamos erro de negócio, não "function not found")
const rpcs = [
  ['transicionar_processo', { p_id: '00000000-0000-0000-0000-000000000000', p_novo: 'ativo', p_justificativa: null }],
  ['publicar_versao', { p_id: '00000000-0000-0000-0000-000000000000', p_motivo: 'teste' }],
  ['gerar_ocorrencia', { p_id: '00000000-0000-0000-0000-000000000000', p_competencia: '2026-07' }],
  ['concluir_ocorrencia', { p_ocorrencia_id: '00000000-0000-0000-0000-000000000000' }],
];
for (const [nome, args] of rpcs) {
  const { error } = await sb.rpc(nome, args);
  if (!error) falha(`RPC ${nome}`, 'executou sem sessão — deveria ter negado');
  else if (/could not find|does not exist|PGRST202/i.test(error.message))
    falha(`RPC ${nome}`, 'função NÃO encontrada — migration incompleta');
  else ok(`RPC ${nome}`, `existe e negou anon ("${error.message.slice(0, 60)}…")`);
}

// 3. Autenticação opcional (para checar dados mínimos):
//    VERIF_EMAIL / VERIF_SENHA no .env permitem testar o fluxo logado.
if (env.VERIF_EMAIL && env.VERIF_SENHA) {
  const { error: authErr } = await sb.auth.signInWithPassword({ email: env.VERIF_EMAIL, password: env.VERIF_SENHA });
  if (authErr) falha('Login de verificação', authErr.message);
  else {
    ok('Login de verificação');
    const { data: pessoa } = await sb.from('pessoas').select('*').limit(5);
    if (!pessoa || pessoa.length === 0)
      falha('Pessoa vinculada', 'usuário logado não enxerga nenhuma pessoa — falta o bootstrap (tenant/área/pessoa) e o vínculo auth_user_id');
    else ok('Pessoa vinculada', `${pessoa.length} pessoa(s) visíveis no tenant`);
    const { data: procs } = await sb.from('processos').select('id,nome,status');
    ok('Processos visíveis', `${procs?.length ?? 0} processo(s)`);
    await sb.auth.signOut();
  }
} else {
  resultados.push(['·', 'Teste logado pulado', 'adicione VERIF_EMAIL e VERIF_SENHA ao .env para testar com sessão']);
}

console.log('\n===== VERIFICAÇÃO DO SETUP =====\n');
for (const [s, nome, det] of resultados) console.log(`${s} ${nome}${det ? ' — ' + det : ''}`);
const falhas = resultados.filter(([s]) => s === '✗').length;
console.log(`\n${falhas === 0 ? 'Setup OK.' : `${falhas} problema(s) encontrado(s).`}`);
process.exit(falhas === 0 ? 0 : 2);
