# Publicar a v1.0.0 no Git — passo a passo detalhado

Roteiro completo, do zero até o código publicado. Tempo estimado: 20–30 minutos.
Cada etapa diz **o que fazer**, **por quê**, e **o que você deve ver** se deu certo.

---

## ETAPA 0 — Limpar a pasta `.git` corrompida (obrigatório, 2 min)

**Por quê:** uma tentativa automática de criar o repositório foi corrompida pelo OneDrive.
Ficou uma pasta oculta `.git` inválida — se ela existir, todos os comandos seguintes falharão
com `fatal: bad config line 1`.

1. Abra o **Explorador de Arquivos** e navegue até:
   `...\Claude\Plataforma Controladoria\plataforma-controladoria`
2. Na faixa superior, clique em **Exibir → Mostrar → Itens ocultos** (Windows 11)
   ou **Exibir → marque "Itens ocultos"** (Windows 10).
3. Se aparecer uma pasta chamada **`.git`** (ícone de pasta esmaecido), **exclua-a**
   (botão direito → Excluir). Confirme o que for perguntado.
4. ✅ **Confira:** a pasta `.git` não existe mais na listagem.

---

## ETAPA 1 — Instalar o Git (5 min, pule se já tiver)

1. Abra o **PowerShell** (menu Iniciar → digite "PowerShell" → Enter) e digite:
   ```powershell
   git --version
   ```
2. **Se aparecer** algo como `git version 2.45.0` → já está instalado, vá para a Etapa 2.
3. **Se aparecer** "git não é reconhecido…" → baixe em **https://git-scm.com/download/win**,
   execute o instalador e aceite todas as opções padrão (Next até o fim).
   *Importante:* feche e reabra o PowerShell depois de instalar.
4. ✅ **Confira:** `git --version` responde com o número da versão.

---

## ETAPA 2 — Criar a conta e o repositório no GitHub (5 min)

1. Acesse **https://github.com** → **Sign up** (se ainda não tiver conta).
   Use o e-mail que preferir; confirme o e-mail de verificação.
2. Logado, clique no **+** no canto superior direito → **New repository**.
3. Preencha:
   - **Repository name:** `plataforma-controladoria`
   - **Description:** `Plataforma de Gestão Operacional da Controladoria`
   - Visibilidade: **Private** (recomendado — é o produto da empresa)
   - ⚠️ **NÃO marque** "Add a README", "Add .gitignore" nem "Choose a license"
     (o projeto já tem os seus; marcar criaria conflito no primeiro push).
4. Clique em **Create repository**.
5. ✅ **Confira:** o GitHub mostra uma página com instruções e a URL do repositório, algo como
   `https://github.com/SEU-USUARIO/plataforma-controladoria.git` — **copie essa URL**, você vai usá-la na Etapa 7.

---

## ETAPA 3 — Abrir o terminal na pasta do projeto (1 min)

No PowerShell, cole (com as aspas!):

```powershell
cd "C:\Users\Leonardo Cavalcanti\OneDrive - ASA RENT A CAR LOCACAO DE VEICULOS EIRELI\Claude\Plataforma Controladoria\plataforma-controladoria"
```

✅ **Confira:** o prompt agora mostra o caminho da pasta. Digite `dir` — você deve ver
`src`, `supabase`, `package.json`, `.gitignore`, `README.md`.

---

## ETAPA 4 — Inicializar o repositório e se identificar (1 min)

```powershell
git init -b main
git config user.name  "Leonardo Cavalcanti"
git config user.email "leonardo.cavalcanti@asalocadora.com.br"
```

**O que cada um faz:** `init -b main` cria o repositório local com o ramo principal chamado `main`;
os dois `config` assinam seus commits (ficam registrados no histórico).

✅ **Confira:** a resposta foi `Initialized empty Git repository in ...`.

---

## ETAPA 5 — Adicionar os arquivos e CONFERIR A SEGURANÇA (2 min)

```powershell
git add -A
git status
```

**O que faz:** `add -A` põe todos os arquivos na "área de preparação"; `status` lista o que será commitado.

✅ **Confira (importante — segurança):** na lista do `status`:
- devem aparecer `src/...`, `supabase/migrations/...`, `package.json`, `README.md`, `.env.example`;
- **NÃO pode aparecer `.env`** (é onde estão suas chaves do Supabase — o `.gitignore` o protege);
- **NÃO pode aparecer `node_modules/`** nem `dist/`.

Teste extra de segurança:
```powershell
git ls-files | findstr env
```
✅ Deve retornar **apenas** `.env.example`. Se aparecer `.env`, PARE e me avise antes de continuar.

---

## ETAPA 6 — O primeiro commit e a tag da versão (1 min)

Cole o bloco inteiro (as aspas duplas seguram as várias linhas):

```powershell
git commit -m "v1.0.0 - Plataforma de Gestao Operacional da Controladoria

- 8 modulos: Central de Trabalho, Demandas, Processos, Equipe, Indicadores, Calendario, Administracao + barra global (Ctrl+K)
- 11 migrations Supabase: regras de negocio no banco (RPCs/triggers), RLS multi-tenant, auditoria imutavel, views BI
- Ciclo completo: processo -> ocorrencia -> demandas -> execucao -> avaliacao do gestor -> indicadores
- Governanca: colaborador solicita, gestor valida (demandas e ativacao de processos)
- Saude Operacional, Conformidade x Maturidade, desempenho com filtros multiplos
- 3 temas (claro navy, escuro, dourado e preto) - import/export Excel de processos"

git tag v1.0.0
```

**O que faz:** o `commit` grava a fotografia da v1.0.0 no histórico local;
a `tag` marca este ponto como a versão 1.0.0 (para sempre encontrável).

✅ **Confira:** `git log --oneline` mostra 1 linha com a mensagem; `git tag` mostra `v1.0.0`.

---

## ETAPA 7 — Conectar ao GitHub e enviar (3 min)

Troque `SEU-USUARIO` pela URL copiada na Etapa 2:

```powershell
git remote add origin https://github.com/SEU-USUARIO/plataforma-controladoria.git
git push -u origin main --tags
```

**O que acontece:** na primeira vez, o Windows abre uma **janela do navegador pedindo login no GitHub**
(Git Credential Manager). Faça o login e clique em **Authorize** — o Git guarda a credencial e não
pede de novo. Depois disso o upload roda.

✅ **Confira:** a resposta termina com algo como
`main -> main` e `[new tag] v1.0.0 -> v1.0.0`, sem mensagens de erro.

---

## ETAPA 8 — Verificar no site (1 min)

1. Abra `https://github.com/SEU-USUARIO/plataforma-controladoria` no navegador.
2. ✅ **Confira:** as pastas `src/` e `supabase/` estão lá; o `README.md` aparece renderizado
   abaixo da lista; em **Tags** (ou no seletor de branches) existe `v1.0.0`;
   e **não existe** arquivo `.env` em lugar nenhum.

🎉 **Publicado.**

---

## DAQUI EM DIANTE — o ritmo dos próximos commits

A cada sprint/ajuste que eu entregar, o ciclo é só este (na pasta do projeto):

```powershell
git add -A
git status                          # sempre conferir o que vai subir
git commit -m "Sprint XX - descreva o que mudou"
git push
```

E quando fecharmos uma versão marcante: `git tag v1.1.0` + `git push --tags`.

## Recomendações finais

- **OneDrive × Git:** funciona, mas o sync disputa com a pasta `.git`. O ideal é clonar o
  repositório para fora do OneDrive e trabalhar de lá:
  ```powershell
  git clone https://github.com/SEU-USUARIO/plataforma-controladoria.git C:\dev\plataforma-controladoria
  ```
  A pasta no OneDrive vira o espelho da documentação; o desenvolvimento vive em `C:\dev`.
- **Documentação de produto:** os 10 documentos de especificação estão na pasta
  `Plataforma Controladoria` (fora do projeto). Se quiser versioná-los junto, crie uma pasta
  `docs/` dentro do projeto, copie os `.md` para lá e faça um commit "docs: especificação funcional v1".
- **Nunca commite** a chave `service_role` do Supabase em nenhuma circunstância.
- Se algo der errado em qualquer etapa, copie a mensagem de erro exata e me mande — eu corrijo o rumo.
