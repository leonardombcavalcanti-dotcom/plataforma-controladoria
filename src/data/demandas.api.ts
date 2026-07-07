// Repository de Demandas — RPCs para tudo que é governado.
import { supabase } from '../lib/supabase';
import type {
  BloqueioDemanda, CausaBloqueio, ComentarioDemanda, Demanda,
  ItemChecklist, MotivoEncerramento, ObservadorDemanda, TempoDemanda,
  TipoDemanda, PrioridadeDemanda, ValorDemanda, ComplexidadeDemanda,
} from '../domain/demandas';

function lancar(e: { message: string } | null): void {
  if (e) throw new Error(e.message);
}

const SELECT_DEMANDA =
  '*, responsavel:pessoas!demandas_responsavel_id_fkey(id,nome),' +
  ' criador:pessoas!demandas_criador_id_fkey(id,nome), processo:processos(id,nome)';

export async function listarDemandas(): Promise<Demanda[]> {
  const { data, error } = await supabase
    .from('demandas').select(SELECT_DEMANDA)
    .is('archived_at', null)
    .order('prazo', { ascending: true });
  lancar(error);
  return (data ?? []) as unknown as Demanda[];
}

export async function obterDemanda(id: string): Promise<Demanda | null> {
  const { data, error } = await supabase
    .from('demandas').select(SELECT_DEMANDA).eq('id', id).maybeSingle();
  lancar(error);
  return data as unknown as Demanda | null;
}

export interface NovaDemandaInput {
  tenant_id: string; area_id: string; titulo: string; descricao?: string | null;
  tipo: TipoDemanda; prioridade: PrioridadeDemanda; valor?: ValorDemanda;
  complexidade?: ComplexidadeDemanda | null; objetivo_negocio?: string | null;
  processo_id?: string | null; criador_id: string;
  responsavel_id: string | null;
  status?: 'aberta' | 'solicitada';
  exige_validacao?: boolean; prazo: string; tempo_estimado_h?: number | null;
  recorrencia?: 'diaria' | 'semanal' | 'mensal' | 'anual' | null;
  peso?: number | null;
}

export async function criarDemanda(input: NovaDemandaInput, checklistHerdado: string[]): Promise<Demanda> {
  const { data, error } = await supabase
    .from('demandas').insert(input).select(SELECT_DEMANDA).single();
  lancar(error);
  const demanda = data as unknown as Demanda;
  if (checklistHerdado.length > 0) {
    const { error: e2 } = await supabase.from('demanda_checklist').insert(
      checklistHerdado.map((texto, i) => ({ demanda_id: demanda.id, ordem: i + 1, texto })),
    );
    lancar(e2);
  }
  return demanda;
}

export async function listarChecklist(demandaId: string): Promise<ItemChecklist[]> {
  const { data, error } = await supabase
    .from('demanda_checklist').select('*')
    .eq('demanda_id', demandaId).is('archived_at', null).order('ordem');
  lancar(error);
  return (data ?? []) as ItemChecklist[];
}

export async function marcarChecklist(id: string, feito: boolean, pessoaId: string): Promise<void> {
  const { error } = await supabase.from('demanda_checklist').update({
    feito, feito_por: feito ? pessoaId : null, feito_em: feito ? new Date().toISOString() : null,
  }).eq('id', id);
  lancar(error);
}

export async function adicionarChecklist(demandaId: string, texto: string, ordem: number): Promise<void> {
  const { error } = await supabase.from('demanda_checklist')
    .insert({ demanda_id: demandaId, texto, ordem });
  lancar(error);
}

export async function listarComentarios(demandaId: string): Promise<ComentarioDemanda[]> {
  const { data, error } = await supabase
    .from('demanda_comentarios')
    .select('*, autor:pessoas!demanda_comentarios_autor_id_fkey(id,nome)')
    .eq('demanda_id', demandaId).order('criado_em', { ascending: false });
  lancar(error);
  return (data ?? []) as unknown as ComentarioDemanda[];
}

export async function comentar(demandaId: string, autorId: string, texto: string): Promise<void> {
  const { error } = await supabase.from('demanda_comentarios')
    .insert({ demanda_id: demandaId, autor_id: autorId, texto });
  lancar(error);
}

export async function listarBloqueios(demandaId: string): Promise<BloqueioDemanda[]> {
  const { data, error } = await supabase
    .from('demanda_bloqueios').select('*')
    .eq('demanda_id', demandaId).order('inicio', { ascending: false });
  lancar(error);
  return (data ?? []) as BloqueioDemanda[];
}

export async function listarTempos(demandaId: string): Promise<TempoDemanda[]> {
  const { data, error } = await supabase
    .from('demanda_tempos')
    .select('*, pessoa:pessoas!demanda_tempos_pessoa_id_fkey(id,nome)')
    .eq('demanda_id', demandaId).order('data', { ascending: false });
  lancar(error);
  return (data ?? []) as unknown as TempoDemanda[];
}

export async function listarObservadores(demandaId: string): Promise<ObservadorDemanda[]> {
  const { data, error } = await supabase
    .from('demanda_observadores')
    .select('*, pessoa:pessoas!demanda_observadores_pessoa_id_fkey(id,nome)')
    .eq('demanda_id', demandaId);
  lancar(error);
  return (data ?? []) as unknown as ObservadorDemanda[];
}

const rpc = async (nome: string, args: Record<string, unknown>) => {
  const { error } = await supabase.rpc(nome, args);
  lancar(error);
};

export const rpcIniciar = (id: string) => rpc('iniciar_demanda', { p_id: id });
export const rpcBloquear = (id: string, causa: CausaBloqueio, descricao: string, previsao: string | null, pedirAjuda: boolean) =>
  rpc('bloquear_demanda', { p_id: id, p_causa: causa, p_descricao: descricao, p_previsao: previsao, p_pedir_ajuda: pedirAjuda });
export const rpcDesbloquear = (id: string) => rpc('desbloquear_demanda', { p_id: id });
export const rpcEnviarValidacao = (id: string) => rpc('enviar_para_validacao', { p_id: id });
export const rpcValidar = (id: string, aprovada: boolean, motivo?: string) =>
  rpc('validar_demanda', { p_id: id, p_aprovada: aprovada, p_motivo: motivo ?? null });
export const rpcConcluir = (id: string, confirmarPendencias: boolean) =>
  rpc('concluir_demanda', { p_id: id, p_confirmar_pendencias: confirmarPendencias });
export const rpcEncerrar = (id: string, motivo: MotivoEncerramento, justificativa: string, original: string | null) =>
  rpc('encerrar_demanda', { p_id: id, p_motivo: motivo, p_justificativa: justificativa, p_original: original });
export const rpcReabrir = (id: string, justificativa: string, novoPrazo: string) =>
  rpc('reabrir_demanda', { p_id: id, p_justificativa: justificativa, p_novo_prazo: novoPrazo });
export const rpcDelegar = (id: string, novoResponsavel: string, mensagem?: string) =>
  rpc('delegar_demanda', { p_id: id, p_novo_responsavel: novoResponsavel, p_mensagem: mensagem ?? null });
export const rpcApontarTempo = (id: string, horas: number, data: string, comentario?: string) =>
  rpc('apontar_tempo', { p_id: id, p_horas: horas, p_data: data, p_comentario: comentario ?? null });

export const rpcAvaliar = (id: string, nota: number, comentario?: string) =>
  rpc('avaliar_demanda', { p_id: id, p_nota: nota, p_comentario: comentario ?? null });
export const rpcAprovarSolicitacao = (id: string, responsavel: string, prazo: string, peso?: number | null) =>
  rpc('aprovar_solicitacao', { p_id: id, p_responsavel: responsavel, p_prazo: prazo, p_peso: peso ?? null });
export const rpcDevolverSolicitacao = (id: string, comentario: string) =>
  rpc('devolver_solicitacao', { p_id: id, p_comentario: comentario });
export const rpcReenviarSolicitacao = (id: string) =>
  rpc('reenviar_solicitacao', { p_id: id });
export const rpcRejeitarSolicitacao = (id: string, motivo: string) =>
  rpc('rejeitar_solicitacao', { p_id: id, p_motivo: motivo });
