// Administração — escrita da estrutura (somente admin; RLS garante).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useUi } from '../store/ui';
import type { Evento, PerfilAcesso } from '../domain/tipos';
import { chaves } from './queries';

function lancar(e: { message: string } | null): void {
  if (e) throw new Error(e.message);
}

export interface Tenant { id: string; nome: string }

export async function obterTenant(): Promise<Tenant | null> {
  const { data, error } = await supabase.from('tenants').select('id, nome').maybeSingle();
  lancar(error);
  return data as Tenant | null;
}

export async function renomearTenant(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from('tenants').update({ nome }).eq('id', id);
  lancar(error);
}

export async function criarArea(tenantId: string, nome: string): Promise<void> {
  const { error } = await supabase.from('areas').insert({ tenant_id: tenantId, nome });
  lancar(error);
}

export async function renomearArea(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from('areas').update({ nome }).eq('id', id);
  lancar(error);
}

export interface PessoaInput {
  nome: string; cargo: string | null; perfil: PerfilAcesso;
  gestor_id: string | null; area_id: string | null; ativa: boolean;
  auth_user_id?: string | null;
}

export interface AcessoPendente {
  id: string; nome: string; email: string; auth_user_id: string | null;
  status: 'pendente' | 'aprovado' | 'rejeitado'; criado_em: string;
}

export async function listarAcessosPendentes(): Promise<AcessoPendente[]> {
  const { data, error } = await supabase
    .from('acessos_pendentes').select('*').order('criado_em', { ascending: false });
  lancar(error);
  return (data ?? []) as AcessoPendente[];
}

export async function decidirAcesso(id: string, status: 'aprovado' | 'rejeitado', decididoPor: string): Promise<void> {
  const { error } = await supabase.from('acessos_pendentes')
    .update({ status, decidido_em: new Date().toISOString(), decidido_por: decididoPor })
    .eq('id', id);
  lancar(error);
}

export async function criarPessoa(tenantId: string, p: PessoaInput): Promise<void> {
  const { error } = await supabase.from('pessoas').insert({ tenant_id: tenantId, ...p });
  lancar(error);
}

export async function atualizarPessoa(id: string, p: Partial<PessoaInput>): Promise<void> {
  const { error } = await supabase.from('pessoas').update(p).eq('id', id);
  lancar(error);
}

export async function excluirPessoa(id: string): Promise<void> {
  const { error } = await supabase.rpc('excluir_pessoa', { p_id: id });
  lancar(error);
}

export async function listarEventosGlobais(): Promise<Evento[]> {
  const { data, error } = await supabase
    .from('eventos')
    .select('*, autor:pessoas!eventos_autor_id_fkey(id,nome)')
    .order('criado_em', { ascending: false })
    .limit(300);
  lancar(error);
  return (data ?? []) as unknown as Evento[];
}

export const useTenant = () => useQuery({ queryKey: ['tenant'], queryFn: obterTenant });
export const useAcessosPendentes = () =>
  useQuery({ queryKey: ['acessos-pendentes'], queryFn: listarAcessosPendentes });
export const useEventosGlobais = () =>
  useQuery({ queryKey: ['eventos-globais'], queryFn: listarEventosGlobais });

export function useAdminMutations() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const ok = (msg: string) => () => {
    void qc.invalidateQueries({ queryKey: ['tenant'] });
    void qc.invalidateQueries({ queryKey: chaves.areas });
    void qc.invalidateQueries({ queryKey: chaves.pessoas });
    void qc.invalidateQueries({ queryKey: chaves.pessoaAtual });
    void qc.invalidateQueries({ queryKey: ['eventos-globais'] });
    void qc.invalidateQueries({ queryKey: ['acessos-pendentes'] });
    toast(msg, 'ok');
  };
  const erro = (e: unknown) =>
    toast(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.', 'erro');

  return {
    renomearTenant: useMutation({
      mutationFn: (p: { id: string; nome: string }) => renomearTenant(p.id, p.nome),
      onSuccess: ok('Empresa atualizada'), onError: erro,
    }),
    criarArea: useMutation({
      mutationFn: (p: { tenantId: string; nome: string }) => criarArea(p.tenantId, p.nome),
      onSuccess: ok('Área criada'), onError: erro,
    }),
    renomearArea: useMutation({
      mutationFn: (p: { id: string; nome: string }) => renomearArea(p.id, p.nome),
      onSuccess: ok('Área atualizada'), onError: erro,
    }),
    criarPessoa: useMutation({
      mutationFn: (p: { tenantId: string; pessoa: PessoaInput }) => criarPessoa(p.tenantId, p.pessoa),
      onSuccess: ok('Pessoa criada — vincule o login quando ela tiver usuário'), onError: erro,
    }),
    excluirPessoa: useMutation({
      mutationFn: (id: string) => excluirPessoa(id),
      onSuccess: ok('Pessoa excluída — remova o login em Authentication, se existir'),
      onError: erro,
    }),
    aprovarAcesso: useMutation({
      mutationFn: async (p: { acesso: AcessoPendente; tenantId: string; decididoPor: string }) => {
        await criarPessoa(p.tenantId, {
          nome: p.acesso.nome, cargo: null, perfil: 'colaborador',
          gestor_id: null, area_id: null, ativa: true,
          auth_user_id: p.acesso.auth_user_id,
        });
        await decidirAcesso(p.acesso.id, 'aprovado', p.decididoPor);
      },
      onSuccess: () => {
        ok('Acesso aprovado — ajuste perfil, gestor e área no cartão da pessoa')();
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
      },
      onError: erro,
    }),
    rejeitarAcesso: useMutation({
      mutationFn: (p: { id: string; decididoPor: string }) => decidirAcesso(p.id, 'rejeitado', p.decididoPor),
      onSuccess: ok('Solicitação rejeitada'),
      onError: erro,
    }),
    atualizarPessoa: useMutation({
      mutationFn: (p: { id: string; pessoa: Partial<PessoaInput> }) => atualizarPessoa(p.id, p.pessoa),
      onSuccess: ok('Pessoa atualizada'), onError: erro,
    }),
  };
}
