// Repository — único lugar que conversa com o Supabase.
// Campos governados (status, versão, arquivamento) mudam SOMENTE via RPC.
import { supabase } from '../lib/supabase';
import type {
  Area, Artefato, Evento, NovoProcessoInput, Ocorrencia, Pessoa,
  Processo, RecorrenciaItem, Relacao, StatusProcesso, VersaoProcesso,
} from '../domain/tipos';

function lancar(e: { message: string } | null): void {
  if (e) throw new Error(e.message);
}

// ---------- leitura ----------
export async function pessoaAtual(): Promise<Pessoa | null> {
  const { data: sess } = await supabase.auth.getUser();
  if (!sess.user) return null;
  const { data, error } = await supabase
    .from('pessoas').select('*').eq('auth_user_id', sess.user.id).maybeSingle();
  lancar(error);
  return data as Pessoa | null;
}

export async function listarPessoas(): Promise<Pessoa[]> {
  const { data, error } = await supabase.from('pessoas').select('*').eq('ativa', true).order('nome');
  lancar(error);
  return (data ?? []) as Pessoa[];
}

export async function listarAreas(): Promise<Area[]> {
  const { data, error } = await supabase.from('areas').select('*').order('nome');
  lancar(error);
  return (data ?? []) as Area[];
}

const SELECT_PROCESSO = '*, dono:pessoas!processos_dono_id_fkey(id,nome), area:areas(id,nome)';

export async function listarProcessos(): Promise<Processo[]> {
  const { data, error } = await supabase
    .from('processos').select(SELECT_PROCESSO).order('nome');
  lancar(error);
  return (data ?? []) as unknown as Processo[];
}

export async function obterProcesso(id: string): Promise<Processo | null> {
  const { data, error } = await supabase
    .from('processos').select(SELECT_PROCESSO).eq('id', id).maybeSingle();
  lancar(error);
  return data as unknown as Processo | null;
}

export async function listarArtefatos(processoId: string): Promise<Artefato[]> {
  const { data, error } = await supabase
    .from('processo_artefatos').select('*')
    .eq('processo_id', processoId).is('archived_at', null)
    .order('tipo').order('ordem');
  lancar(error);
  return (data ?? []) as Artefato[];
}

export async function listarRecorrencia(processoId: string): Promise<RecorrenciaItem[]> {
  const { data, error } = await supabase
    .from('processo_recorrencia').select('*')
    .eq('processo_id', processoId).is('archived_at', null).order('ordem');
  lancar(error);
  return (data ?? []) as RecorrenciaItem[];
}

export async function listarRelacoes(processoId: string): Promise<Relacao[]> {
  const { data, error } = await supabase
    .from('processo_relacoes').select('*')
    .or(`origem_id.eq.${processoId},destino_id.eq.${processoId}`);
  lancar(error);
  return (data ?? []) as Relacao[];
}

export async function listarVersoes(processoId: string): Promise<VersaoProcesso[]> {
  const { data, error } = await supabase
    .from('processo_versoes')
    .select('*, autor:pessoas!processo_versoes_autor_id_fkey(id,nome)')
    .eq('processo_id', processoId).order('versao', { ascending: false });
  lancar(error);
  return (data ?? []) as unknown as VersaoProcesso[];
}

export async function listarOcorrencias(processoId: string): Promise<Ocorrencia[]> {
  const { data, error } = await supabase
    .from('ocorrencias').select('*')
    .eq('processo_id', processoId).order('competencia', { ascending: false });
  lancar(error);
  return (data ?? []) as Ocorrencia[];
}

export async function listarEventos(objetoId: string): Promise<Evento[]> {
  const { data, error } = await supabase
    .from('eventos')
    .select('*, autor:pessoas!eventos_autor_id_fkey(id,nome)')
    .eq('objeto_id', objetoId).order('criado_em', { ascending: false }).limit(100);
  lancar(error);
  return (data ?? []) as unknown as Evento[];
}

// ---------- escrita (campos NÃO governados) ----------
export async function criarProcesso(input: NovoProcessoInput): Promise<Processo> {
  const { data, error } = await supabase
    .from('processos').insert(input).select(SELECT_PROCESSO).single();
  lancar(error);
  return data as unknown as Processo;
}

export async function salvarProcesso(
  id: string,
  patch: Partial<Pick<Processo,
    'nome' | 'objetivo' | 'descricao' | 'periodicidade' | 'dono_id' | 'substituto_id' |
    'entradas' | 'saidas' | 'criterio_inicio' | 'criterio_encerramento' |
    'proxima_revisao' | 'macroprocesso_id' | 'area_id'>>,
): Promise<void> {
  const { error } = await supabase.from('processos').update(patch).eq('id', id);
  lancar(error);
}

export async function criarArtefato(a: Omit<Artefato, 'id' | 'archived_at'>): Promise<void> {
  const { error } = await supabase.from('processo_artefatos').insert(a);
  lancar(error);
}

export async function salvarArtefato(id: string, patch: Partial<Pick<Artefato, 'titulo' | 'conteudo' | 'ordem'>>): Promise<void> {
  const { error } = await supabase.from('processo_artefatos').update(patch).eq('id', id);
  lancar(error);
}

export async function removerArtefato(id: string): Promise<void> {
  // remoção lógica — rastreabilidade (archived_at)
  const { error } = await supabase.from('processo_artefatos')
    .update({ archived_at: new Date().toISOString() }).eq('id', id);
  lancar(error);
}

export async function criarRecorrencia(r: Omit<RecorrenciaItem, 'id' | 'archived_at'>): Promise<void> {
  const { error } = await supabase.from('processo_recorrencia').insert(r);
  lancar(error);
}

export async function removerRecorrencia(id: string): Promise<void> {
  const { error } = await supabase.from('processo_recorrencia')
    .update({ archived_at: new Date().toISOString() }).eq('id', id);
  lancar(error);
}

// ---------- RPCs (campos governados — regra no banco) ----------
export async function rpcTransicionar(id: string, novo: StatusProcesso, justificativa?: string): Promise<void> {
  const { error } = await supabase.rpc('transicionar_processo', {
    p_id: id, p_novo: novo, p_justificativa: justificativa ?? null,
  });
  lancar(error);
}

export async function rpcPublicarVersao(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('publicar_versao', { p_id: id, p_motivo: motivo });
  lancar(error);
}

export async function rpcGerarOcorrencia(id: string, competencia: string): Promise<void> {
  const { error } = await supabase.rpc('gerar_ocorrencia', { p_id: id, p_competencia: competencia });
  lancar(error);
}

export async function rpcConcluirOcorrencia(ocorrenciaId: string): Promise<void> {
  const { error } = await supabase.rpc('concluir_ocorrencia', { p_ocorrencia_id: ocorrenciaId });
  lancar(error);
}
