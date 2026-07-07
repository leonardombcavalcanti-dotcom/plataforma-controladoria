// Hooks TanStack Query — estado do servidor com cache e invalidação.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';
import type { NovoProcessoInput, StatusProcesso } from '../domain/tipos';
import { useUi } from '../store/ui';

export const chaves = {
  pessoas: ['pessoas'] as const,
  areas: ['areas'] as const,
  pessoaAtual: ['pessoa-atual'] as const,
  processos: ['processos'] as const,
  processo: (id: string) => ['processo', id] as const,
  artefatos: (id: string) => ['artefatos', id] as const,
  recorrencia: (id: string) => ['recorrencia', id] as const,
  versoes: (id: string) => ['versoes', id] as const,
  ocorrencias: (id: string) => ['ocorrencias', id] as const,
  eventos: (id: string) => ['eventos', id] as const,
};

export const usePessoas = () => useQuery({ queryKey: chaves.pessoas, queryFn: api.listarPessoas });
export const useAreas = () => useQuery({ queryKey: chaves.areas, queryFn: api.listarAreas });
export const usePessoaAtual = () => useQuery({ queryKey: chaves.pessoaAtual, queryFn: api.pessoaAtual });
export const useProcessos = () => useQuery({ queryKey: chaves.processos, queryFn: api.listarProcessos });
export const useProcesso = (id: string) =>
  useQuery({ queryKey: chaves.processo(id), queryFn: () => api.obterProcesso(id), enabled: !!id });
export const useArtefatos = (id: string) =>
  useQuery({ queryKey: chaves.artefatos(id), queryFn: () => api.listarArtefatos(id), enabled: !!id });
export const useRecorrencia = (id: string) =>
  useQuery({ queryKey: chaves.recorrencia(id), queryFn: () => api.listarRecorrencia(id), enabled: !!id });
export const useVersoes = (id: string) =>
  useQuery({ queryKey: chaves.versoes(id), queryFn: () => api.listarVersoes(id), enabled: !!id });
export const useOcorrencias = (id: string) =>
  useQuery({ queryKey: chaves.ocorrencias(id), queryFn: () => api.listarOcorrencias(id), enabled: !!id });
export const useEventos = (id: string) =>
  useQuery({ queryKey: chaves.eventos(id), queryFn: () => api.listarEventos(id), enabled: !!id });

function useInvalidarProcesso() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: chaves.processos });
    void qc.invalidateQueries({ queryKey: chaves.processo(id) });
    void qc.invalidateQueries({ queryKey: chaves.artefatos(id) });
    void qc.invalidateQueries({ queryKey: chaves.recorrencia(id) });
    void qc.invalidateQueries({ queryKey: chaves.versoes(id) });
    void qc.invalidateQueries({ queryKey: chaves.ocorrencias(id) });
    void qc.invalidateQueries({ queryKey: chaves.eventos(id) });
  };
}

function usarErroToast() {
  const toast = useUi((s) => s.toast);
  return (e: unknown) =>
    toast(e instanceof Error ? e.message : 'Não foi possível concluir a ação. Tente novamente.', 'erro');
}

export function useCriarProcesso() {
  const qc = useQueryClient();
  const erro = usarErroToast();
  return useMutation({
    mutationFn: (input: NovoProcessoInput) => api.criarProcesso(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chaves.processos }),
    onError: erro,
  });
}

export function useSalvarProcesso(id: string) {
  const invalidar = useInvalidarProcesso();
  const toast = useUi((s) => s.toast);
  const erro = usarErroToast();
  return useMutation({
    mutationFn: (patch: Parameters<typeof api.salvarProcesso>[1]) => api.salvarProcesso(id, patch),
    onSuccess: () => { invalidar(id); toast('Salvo', 'ok'); },
    onError: erro,
  });
}

export function useTransicionar(id: string) {
  const invalidar = useInvalidarProcesso();
  const toast = useUi((s) => s.toast);
  const erro = usarErroToast();
  return useMutation({
    mutationFn: (p: { novo: StatusProcesso; justificativa?: string }) =>
      api.rpcTransicionar(id, p.novo, p.justificativa),
    onSuccess: () => { invalidar(id); toast('Status atualizado', 'ok'); },
    onError: erro,
  });
}

export function usePublicarVersao(id: string) {
  const invalidar = useInvalidarProcesso();
  const toast = useUi((s) => s.toast);
  const erro = usarErroToast();
  return useMutation({
    mutationFn: (motivo: string) => api.rpcPublicarVersao(id, motivo),
    onSuccess: () => { invalidar(id); toast('✔ Nova versão publicada', 'ok'); },
    onError: erro,
  });
}

export function useGerarOcorrencia(id: string) {
  const invalidar = useInvalidarProcesso();
  const toast = useUi((s) => s.toast);
  const erro = usarErroToast();
  return useMutation({
    mutationFn: (competencia: string) => api.rpcGerarOcorrencia(id, competencia),
    onSuccess: () => { invalidar(id); toast('Ocorrência gerada', 'ok'); },
    onError: erro,
  });
}

export function useConcluirOcorrencia(processoId: string) {
  const invalidar = useInvalidarProcesso();
  const toast = useUi((s) => s.toast);
  const erro = usarErroToast();
  return useMutation({
    mutationFn: (ocorrenciaId: string) => api.rpcConcluirOcorrencia(ocorrenciaId),
    onSuccess: () => { invalidar(processoId); toast('Ocorrência concluída — resumo da execução registrado', 'ok'); },
    onError: erro,
  });
}

export function useArtefatoMutations(processoId: string) {
  const invalidar = useInvalidarProcesso();
  const erro = usarErroToast();
  const opts = { onSuccess: () => invalidar(processoId), onError: erro };
  return {
    criar: useMutation({ mutationFn: api.criarArtefato, ...opts }),
    salvar: useMutation({
      mutationFn: (p: { id: string; patch: Parameters<typeof api.salvarArtefato>[1] }) =>
        api.salvarArtefato(p.id, p.patch),
      ...opts,
    }),
    remover: useMutation({ mutationFn: api.removerArtefato, ...opts }),
  };
}

export function useRecorrenciaMutations(processoId: string) {
  const invalidar = useInvalidarProcesso();
  const erro = usarErroToast();
  const opts = { onSuccess: () => invalidar(processoId), onError: erro };
  return {
    criar: useMutation({ mutationFn: api.criarRecorrencia, ...opts }),
    remover: useMutation({ mutationFn: api.removerRecorrencia, ...opts }),
  };
}
