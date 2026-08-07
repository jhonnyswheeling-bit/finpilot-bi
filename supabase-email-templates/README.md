# Templates de e-mail — FinPilot BI

Estes 4 arquivos são o conteúdo HTML pronto para colar no painel do Supabase.
O Supabase **não permite subir esses templates via SQL/código** — a
configuração fica em *Authentication → Email Templates*, então essa etapa é
manual, uma única vez por projeto.

## Como aplicar

Painel do Supabase → seu projeto → **Authentication → Email Templates**:

| Arquivo | Template no Supabase | Assunto sugerido |
|---|---|---|
| `1-confirmar-cadastro.html` | Confirm signup | Confirme seu e-mail e ative sua conta no FinPilot BI |
| `2-recuperar-senha.html` | Reset password | Redefinir sua senha do FinPilot BI |
| `3-alterar-email.html` | Change Email Address | Confirme a alteração do seu e-mail no FinPilot BI |
| `4-convite.html` | Invite user | Você foi convidado para o FinPilot BI |

Para cada um: abra o template correspondente no Supabase, cole o **Subject**
sugerido acima e cole o conteúdo do arquivo `.html` no corpo (campo
"Message body"). Salve.

## Sobre o design

- Identidade visual igual à do app: gradiente indigo → roxo (`#6366f1` →
  `#8b5cf6`), tipografia do sistema, cantos arredondados.
- HTML com estilos inline e tabelas, para compatibilidade com clientes de
  e-mail (Gmail, Outlook, Apple Mail).
- Assinatura padrão em todos:
  > Equipe FinPilot BI
  > Transformando números em decisões inteligentes.
- Todos usam a variável `{{ .ConfirmationURL }}`, que o Supabase substitui
  automaticamente pelo link de ação correto.

## O que isso não altera

Essa personalização é só do **conteúdo do e-mail enviado pelo Supabase** —
não afeta nenhum código do app (`index.html`, `css/`, `js/`). O comportamento
de login, cadastro, recuperação de senha etc. continua exatamente o mesmo.
