import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './demandas.api';
import { chaves as chavesProcessos } from './queries';
import { useUi } from '../store/ui';

export const chavesDemandas = {
  lista: ['demandas'] as const,
  demanda: (id: string) => ['demanda', id] as const,
  checklist: (id: string) => ['demanda-checklist', id] as const,
  comentarios: (id: string) => ['demanda-comentarios', id] as const,
  bloqueios: (id: string) => ['demanda-bloqueios', id] as const,
  tempos: (id: string) => ['demanda-tempos', id] as const,
  observadores: (id: string) => ['demanda-observadores', id] as const,
  eventos: (id: string) => ['eventos', id] as const, // mesmo padrão dos processos
};

export const useDemandas = () =>
  useQuery({ queryKey: chavesDemandas.lista, queryFn: api.listarDemandas });
export const useDemanda = (id: string) =>
  useQuery({ queryKey: chavesDemandas.demanda(id), queryFn: () => api.obterDemanda(id), enabled: !!id });
export const useChecklist = (id: string) =>
  useQuery({ queryKey: chavesDemandas.checklist(id), queryFn: () => api.listarChecklist(id), enabled: !!id });
export const useComentarios = (id: string) =>
  useQuery({ queryKey: chavesDemandas.comentarios(id), queryFn: () => api.listarComentarios(id), enabled: !!id });
export const useBloqueios = (id: string) =>
  useQuery({ queryKey: chavesDemandas.bloqueios(id), queryFn: () => api.listarBloqueios(id), enabled: !!id });
export const useTempos = (id: string) =>
  useQuery({ queryKey: chavesDemandas.tempos(id), queryFn: () => api.listarTempos(id), enabled: !!id });
export const useObservadores = (id: string) =>
  useQuery({ queryKey: chavesDemandas.observadores(id), queryFn: () => api.listarObservadores(id), enabled: !!id });

export function useInvalidarDemanda() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: chavesDemandas.lista });
    void qc.invalidateQueries({ queryKey: chavesDemandas.demanda(id) });
    void qc.invalidateQueries({ queryKey: chavesDemandas.checklist(id) });
    void qc.invalidateQueries({ queryKey: chavesDemandas.comentarios(id) });
    void qc.invalidateQueries({ queryKey: chavesDemandas.bloqueios(id) });
    void qc.invalidateQueries({ queryKey: chavesDemandas.tempos(id) });
    void qc.invalidateQueries({ queryKey: chavesDemandas.observadores(id) });
    void qc.invalidateQueries({ queryKey: chavesDemandas.eventos(id) });
    // conclusão pode ter fechado a ocorrência
    void qc.invalidateQueries({ queryKey: chavesProcessos.processos });
  };
}

export function useAcaoDemanda(id: string) {
  const invalidar = useInvalidarDemanda();
  const toast = useUi((s) => s.toast);
  return useMutation({
    mutationFn: async (p: { acao: () => Promise<void>; sucesso?: string }) => {
      await p.acao();
      return p.sucesso;
    },
    onSuccess: (sucesso) => {
      invalidar(id);
      if (sucesso) toast(sucesso, 'ok');
    },
    onError: (e) =>
      toast(e instanceof Error ? e.message : 'Não foi possível concluir a ação. Tente novamente.', 'erro'),
  });
}

export function useCriarDemanda() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  return useMutation({
    mutationFn: (p: { input: api.NovaDemandaInput; checklist: string[] }) =>
      api.criarDemanda(p.input, p.checklist),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chavesDemandas.lista });
      toast('Demanda criada', 'ok');
    },
    onError: (e) =>
      toast(e instanceof Error ? e.message : 'Não foi possível criar a demanda.', 'erro'),
  });
}
