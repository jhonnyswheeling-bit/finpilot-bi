# FinPilot BI

Dashboard financeiro inteligente — importação de planilhas, lançamentos manuais,
Visão Geral, Relatórios, Metas, Diagnóstico Financeiro e Comparativos, com
autenticação de usuários via Supabase.

## Estrutura do projeto

```
finpilot-bi/
├── index.html          # Estrutura das telas (auth, upload, configuração, dashboard)
├── css/
│   └── style.css       # Todo o estilo visual (idêntico ao original)
├── js/
│   ├── app.js           # Núcleo: state, utilitários, upload/config, navegação, dados
│   ├── auth.js          # Autenticação (Supabase Auth) + config do cliente Supabase
│   ├── dashboard.js      # Visão Geral, Diagnóstico, Metas, Comparativos, Tabela, Lançamentos
│   └── charts.js         # Construção dos gráficos (Chart.js)
├── assets/               # Reservado para imagens/ícones estáticos futuros
├── vercel.json
└── .gitignore
```

A aplicação é 100% client-side (sem back-end próprio): os dados de planilha são
processados no navegador e a persistência de lançamentos manuais/metas usa
`localStorage`, hoje por usuário autenticado via Supabase. A ordem de
carregamento dos scripts em `index.html` importa: `app.js` define o objeto
`App`; `dashboard.js` e `charts.js` o estendem com `Object.assign`; `auth.js`
carrega por último e inicia a verificação de sessão.

## Configuração do Supabase

Antes de publicar, confira em `js/auth.js` o bloco:

```js
// ===== Configuração do Supabase =====
const SUPABASE_URL = "...";
const SUPABASE_ANON_KEY = "...";
```

Os valores vêm do painel do Supabase em **Settings → API** (Project URL e
chave pública/anon). Nunca use a `service_role key` aqui.

### Personalizando os e-mails de autenticação

A pasta `supabase-email-templates/` contém os templates HTML (confirmação de
cadastro, recuperação de senha, alteração de e-mail e convite) já com a
identidade visual do FinPilot BI, em português. Eles precisam ser colados
manualmente no painel do Supabase (`Authentication → Email Templates`) — veja
o `README.md` dentro dessa pasta para o passo a passo.

## Rodando localmente

Como é um site estático, qualquer servidor HTTP simples funciona, por exemplo:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Abrir `index.html` diretamente pelo navegador (file://) também costuma
funcionar, mas alguns navegadores restringem chamadas de rede nesse modo —
prefira um servidor local para testar com segurança.

## Deploy na Vercel

1. Suba esta pasta para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), clique em **New Project** e importe o
   repositório.
3. Framework Preset: **Other** (site estático, sem build step).
4. Build Command: (vazio) — Output Directory: (raiz do projeto).
5. Deploy.

Nenhuma variável de ambiente é necessária na Vercel, pois a URL e a chave do
Supabase estão em `js/auth.js` (chave pública, segura para o client-side).

## O que preservar em qualquer alteração futura

- A ordem dos `<script>` em `index.html` (`app.js` → `dashboard.js` →
  `charts.js` → `auth.js`).
- Os nomes dos métodos do objeto `App` (chamados entre si via `this.metodo()`).
- As chaves de `localStorage` (`databi_manual_entries_v1`,
  `databi_goals_v1`, `databi_username_v1`).
