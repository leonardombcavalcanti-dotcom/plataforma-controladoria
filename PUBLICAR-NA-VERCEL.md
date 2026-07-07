# Publicar na Vercel — passo a passo detalhado

Do repositório no GitHub até o link online. Tempo estimado: 10–15 minutos.
Cada etapa: **o que fazer**, **por quê**, e **✅ Confira** para validar antes de seguir.

---

## ETAPA 0 — Enviar o `vercel.json` para o GitHub (2 min, obrigatório)

**Por quê:** criei o arquivo `vercel.json` na pasta do projeto. Ele ensina a Vercel a devolver o
`index.html` para qualquer rota — sem ele, abrir ou atualizar a página em `/demandas/inbox`
retornaria **erro 404**, porque as rotas são do React (client-side), não do servidor.

No PowerShell, na pasta do projeto (a mesma de onde você fez o push):

```powershell
git add vercel.json PUBLICAR-NA-VERCEL.md
git commit -m "infra: configuracao de rotas SPA para a Vercel"
git push
```

✅ **Confira:** no GitHub, o arquivo `vercel.json` aparece na raiz do repositório.

---

## ETAPA 1 — Criar a conta na Vercel (3 min)

1. Acesse **https://vercel.com** → **Sign Up**.
2. Escolha **Continue with GitHub** (é o caminho certo: conecta as duas plataformas de uma vez).
3. Autorize a Vercel no popup do GitHub (**Authorize Vercel**).
4. Se perguntar o tipo de conta, escolha **Hobby** (gratuito — suficiente para começar).

✅ **Confira:** você caiu no painel da Vercel (dashboard), logado com seu usuário do GitHub.

---

## ETAPA 2 — Importar o repositório (2 min)

1. No dashboard, clique em **Add New… → Project**.
2. A lista dos seus repositórios do GitHub aparece. Se `plataforma-controladoria` **não** aparecer:
   clique em **Adjust GitHub App Permissions** → selecione o repositório → **Install/Save**.
3. Clique em **Import** ao lado de `plataforma-controladoria`.

✅ **Confira:** abriu a tela **"Configure Project"**.

---

## ETAPA 3 — Configurar o projeto (3 min — a etapa mais importante)

Na tela de configuração:

1. **Framework Preset:** a Vercel deve detectar **Vite** sozinha.
   Se não detectar, selecione **Vite** manualmente na lista.
2. **Root Directory:** deixe como está (`./`) — o projeto está na raiz do repositório.
3. **Build and Output Settings:** não mexa (o preset Vite já usa `npm run build` e a pasta `dist`).
4. **Environment Variables** — aqui entram as chaves do Supabase (⚠️ sem elas o app abre em branco
   com erro de configuração). Adicione **duas** variáveis, uma por vez:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://vxnxzhvgmipozanbaveg.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | a sua anon key (a mesma do seu arquivo `.env` local) |

   Digite o Name, cole o Value, clique **Add** — e repita para a segunda.
   *(A anon key é a chave pública do cliente; é seguro usá-la aqui. A `service_role` JAMAIS.)*

✅ **Confira:** as duas variáveis listadas antes de prosseguir.

---

## ETAPA 4 — Deploy (2 min)

1. Clique em **Deploy**.
2. Acompanhe o log: `Installing dependencies…` → `Building…` → ✅.
   (O build roda `tsc + vite`, o mesmo que validamos a cada sprint — deve passar limpo.)

✅ **Confira:** tela de parabéns com o preview da tela de login e o botão **Visit**.

**Se o build falhar:** clique no log vermelho, copie as últimas ~20 linhas e me mande — eu corrijo.

---

## ETAPA 5 — Pegar o link e testar (3 min)

1. Clique em **Visit** — seu link será algo como:
   `https://plataforma-controladoria.vercel.app`
2. Teste o essencial:
   - **Login** com seu e-mail/senha → deve cair na Central de Trabalho;
   - Navegue até **Demandas → Inbox** e aperte **F5** (atualizar) → a página deve recarregar
     normalmente (é o `vercel.json` trabalhando);
   - Troque o **tema** e crie/conclua uma demanda de teste.

✅ **Confira:** tudo funcionando igual ao `localhost`.

---

## ETAPA 6 — Ajuste no Supabase (2 min, recomendado)

**Por quê:** o Supabase mantém uma lista de URLs confiáveis para fluxos de autenticação.

1. No painel do Supabase: **Authentication → URL Configuration**.
2. Em **Site URL**, coloque o seu link da Vercel: `https://plataforma-controladoria.vercel.app`.
3. **Save**.

---

## PRONTO — e daqui em diante

- **Deploy automático:** a partir de agora, **todo `git push` publica sozinho**.
  O ciclo completo de uma atualização minha passa a ser:
  ```powershell
  git add -A
  git commit -m "Sprint XX - ..."
  git push          # a Vercel builda e publica em ~1 minuto
  ```
  (+ rodar a migration no SQL Editor quando a sprint tiver uma.)
- **Compartilhar com a equipe:** mande o link — cada pessoa clica em "Não tem acesso? Solicitar"
  e você aprova na Administração. O RLS garante que cada um vê só o que deve.
- **Domínio próprio (opcional):** Vercel → Settings → Domains permite usar algo como
  `controladoria.asalocadora.com.br` (exige acesso ao DNS do domínio da empresa).
- **Ambientes (futuro):** a Vercel cria um preview para cada branch — quando houver equipe de
  desenvolvimento, branches de feature ganham URLs de teste automáticas antes do merge.

Qualquer erro em qualquer etapa: copie a mensagem exata e me mande.
