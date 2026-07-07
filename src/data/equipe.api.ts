// Módulo Equipe — feedbacks bilaterais (Fluxo 9). Visibilidade garantida por RLS.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useUi } from '../store/ui';
import type { Pessoa } from '../domain/tipos';

function lancar(e: { message: string } | null): void {
  if (e) throw new Error(e.message);
}

export type TipoFeedback =
  | 'reconhecimento' | 'desenvolvimento' | 'correcao' | 'orientacao' | 'parabenizacao';

export const TIPO_FEEDBACK: Record<TipoFeedback, { rotulo: string; tom: 'saudavel' | 'info' | 'atencao' | 'neutro' }> = {
  reconhecimento: { rotulo: '⭐ Reconhecimento', tom: 'saudavel' },
  parabenizacao:  { rotulo: '🎉 Parabenização',  tom: 'saudavel' },
  desenvolvimento:{ rotulo: 'Desenvolvimento',   tom: 'info' },
  orientacao:     { rotulo: 'Orientação',        tom: 'info' },
  correcao:       { rotulo: 'Correção',          tom: 'atencao' },
};

export interface RespostaFeedback {
  id: string; feedback_id: string; autor_id: string; texto: string; criado_em: string;
  autor?: Pick<Pessoa, 'id' | 'nome'> | null;
}

export interface Feedback {
  id: string; tenant_id: string; de_id: string; para_id: string;
  tipo: TipoFeedback; texto: string; demanda_id: string | null; criado_em: string;
  de?: Pick<Pessoa, 'id' | 'nome'> | null;
  para?: Pick<Pessoa, 'id' | 'nome'> | null;
  demanda?: { id: string; titulo: string } | null;
  respostas?: RespostaFeedback[];
}

const SELECT_FEEDBACK =
  '*, de:pessoas!feedbacks_de_id_fkey(id,nome), para:pessoas!feedbacks_para_id_fkey(id,nome),' +
  ' demanda:demandas(id,titulo),' +
  ' respostas:feedback_respostas(*, autor:pessoas!feedback_respostas_autor_id_fkey(id,nome))';

export async function listarFeedbacks(pessoaId?: string): Promise<Feedback[]> {
  let q = supabase.from('feedbacks').select(SELECT_FEEDBACK).order('criado_em', { ascending: false });
  if (pessoaId) q = q.eq('para_id', pessoaId);
  const { data, error } = await q;
  lancar(error);
  const lista = (data ?? []) as unknown as Feedback[];
  for (const f of lista) {
    f.respostas = (f.respostas ?? []).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
  }
  return lista;
}

export async function enviarFeedback(f: {
  tenant_id: string; de_id: string; para_id: string;
  tipo: TipoFeedback; texto: string; demanda_id?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('feedbacks').insert(f);
  lancar(error);
}

export async function responderFeedback(feedbackId: string, autorId: string, texto: string): Promise<void> {
  const { error } = await supabase.from('feedback_respostas')
    .insert({ feedback_id: feedbackId, autor_id: autorId, texto });
  lancar(error);
}

export const useFeedbacks = (pessoaId?: string) =>
  useQuery({ queryKey: ['feedbacks', pessoaId ?? 'todos'], queryFn: () => listarFeedbacks(pessoaId) });

export function useFeedbackMutations() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const invalidar = () => void qc.invalidateQueries({ queryKey: ['feedbacks'] });
  return {
    enviar: useMutation({
      mutationFn: enviarFeedback,
      onSuccess: () => { invalidar(); toast('Feedback enviado', 'ok'); },
      onError: (e) => toast(e instanceof Error ? e.message : 'Não foi possível enviar o feedback.', 'erro'),
    }),
    responder: useMutation({
      mutationFn: (p: { feedbackId: string; autorId: string; texto: string }) =>
        responderFeedback(p.feedbackId, p.autorId, p.texto),
      onSuccess: () => invalidar(),
      onError: (e) => toast(e instanceof Error ? e.message : 'Não foi possível responder.', 'erro'),
    }),
  };
}
