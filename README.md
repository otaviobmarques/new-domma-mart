# Domma Mart

Plataforma de infoprodutos da família Domma: o produtor cadastra o produto, a plataforma faz o checkout, recebe o pagamento, divide o dinheiro, entrega o conteúdo e repassa o saldo.

Este repositório implementa a **Fase 1 — Vender** do descritivo técnico (versão 2.2). Os pagamentos rodam em um **provedor simulado**: nenhum dinheiro real se move até a escolha do provedor (decisão em aberto nº 1 do descritivo).

## Como rodar

Precisa de Node 22+, pnpm 10 e PostgreSQL 16 (ou Docker).

```bash
pnpm install
```

```bash
pnpm db:start
```

```bash
cp .env.example .env
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

Em dois terminais:

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

- Site e painel: http://localhost:3000
- API: http://localhost:4000 — documentação em http://localhost:4000/docs
- O `db:seed` cria o produtor `rafael@exemplo.com`, um curso com order bump, o cupom `BEMVINDO` e algumas vendas, e mostra o link do checkout.
- Em desenvolvimento não há senha nem e-mail de verdade: o código de 6 dígitos aparece na própria tela.
- Cartões de teste: `4242 4242 4242 4242` (aprovado), `4000 0000 0000 9995` (sem limite), `4000 0000 0000 0002` (recusado).
- Backoffice: coloque o seu e-mail em `BACKOFFICE_EMAILS` no `.env`, entre com ele e abra `/backoffice`. Para testar a dupla aprovação, coloque dois e-mails separados por vírgula.

Testes, tipos e build:

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm build
```

Os testes da API usam o banco `domma_test`, criado pelo `pnpm db:start`.

## Estrutura

| Pasta | O que é |
|---|---|
| `packages/core` | Regras puras, sem banco: taxas (12.2), liberação e reserva (12.4), livro-razão de dupla entrada, CPF/CNPJ, criptografia por campo, assinatura de webhook e a interface da camada de pagamento com o provedor simulado |
| `packages/db` | Migrações SQL e a conexão com contexto de isolamento por conta |
| `apps/api` | API REST `/v1` (Hono). Tudo o que o painel faz passa por ela. OpenAPI gerada das próprias rotas |
| `apps/web` | Next.js: checkout, área do comprador, painel do produtor e backoffice |

## O que a Fase 1 entrega

| Entrega do descritivo | Situação |
|---|---|
| Cadastro sem senha (P01) | Pronto. Login com Google ainda não |
| Verificação de identidade (P02) | Documento e chave Pix validados e criptografados; foto e selfie dependem do provedor de identidade |
| Criar produto com IA (P04) | Pronto. Com `ANTHROPIC_API_KEY` usa o modelo; sem chave, um gerador local simples. Envio de arquivos e capa gerada ainda não |
| Checkout Pix e cartão (C01–C03) | Pronto no provedor simulado, com order bump, cupom, parcelamento, salvamento a cada campo e confirmação em tempo real |
| Área de membros simples (C06) | Módulos, aulas, progresso e liberação gradual. Vídeo por endereço; envio protegido depende do provedor de vídeo |
| Área do comprador (C04, C05, C07) | Entrada por e-mail, celular ou CPF; reembolso automático na garantia; linha do tempo do reembolso; página de ajuda com atendimento humano e prazo de 1 dia útil |
| Este link é verdadeiro? (C08) | Pronto |
| Início, Produtos, Vendas, Financeiro (P03, P05, P08, P09) | Prontos, com order bump, cupons e troca de chave Pix pelo painel. Editor de checkout (P06) com pré-visualização ao vivo, rascunho e publicação; teste A/B e sugestões da IA são da fase 3. Editor da área de membros (P07) com arrastar e soltar, materiais de apoio e liberação por dias ou por data; envio de vídeos e "Organizar com IA" dependem do provedor de vídeo e da fase 2 |
| Saque | Pronto no provedor simulado: mesma titularidade, segundo fator, bloqueio de 24 h após troca de chave Pix |
| Backoffice (B01 a B05) | Painel, fila de produtos, de contas e de atendimento, busca de contas e visão da conta com bloqueio de saque. Risco e contestações (chargeback): valor separado em "em contestação", provas do produtor, defesa e resultado. Condições da conta e configurações da plataforma com dupla aprovação (quem pede não aprova) e histórico de versões. Tudo com motivo registrado |
| Webhooks principais e chaves de API (P11) | Prontos: assinatura HMAC, reenvio por até 72 h, histórico e reenvio manual |
| Atendimento ao comprador com IA | Pronto. Chat na página de Ajuda: a assistente vê as compras da pessoa, reenvia o acesso, mostra o botão certo e encaminha para a equipe com o resumo do caso. Ela não pede nem aprova reembolso. Com `ANTHROPIC_API_KEY` usa o modelo; sem chave, respostas prontas. Resposta em tempo real (letra a letra) e WhatsApp ainda não |
| WhatsApp | Ainda não: os avisos saem só por e-mail (Resend) |
| Nota fiscal, boleto, assinaturas, afiliados | Fases 2 e 3 |

## Site, SEO e aplicativo

- **Modo claro e modo noturno** em todas as telas, com botão para alternar. Sem escolha salva, segue a preferência do aparelho. As cores são variáveis em `apps/web/app/globals.css`.
- **Banner animado** no topo da página inicial, feito com [Remotion](https://www.remotion.dev) (`apps/web/components/home/banner-composition.tsx`). Atenção à licença: o Remotion é gratuito para pessoas e empresas de até 3 pessoas; acima disso, exige licença paga.
- **SEO**: título, descrição, endereço canônico, `robots.txt`, `sitemap.xml` e dados estruturados. Áreas logadas e checkouts ficam fora da busca.
- **Prévia de link** (WhatsApp, Instagram, X): imagem gerada para o site e uma para cada checkout, com produto, preço e garantia.
- **Aplicativo instalável (PWA)**: manifesto, ícones, atalhos e tela de "sem conexão". Por segurança, páginas e dados nunca ficam em cache — só arquivos estáticos.
- As fotos da página inicial foram geradas por IA e não são clientes reais.

## Decisões de arquitetura

- **Dinheiro é inteiro em centavos**, do banco à tela.
- **Livro-razão de dupla entrada, somente inclusão.** Gatilhos no banco impedem alterar ou apagar lançamentos e recusam qualquer movimento que não feche em zero. Carteiras do produtor: a liberar, disponível e reservado.
- **Isolamento por conta no próprio banco (RLS).** A API abre cada transação com o contexto da conta ou da pessoa; sem contexto, nenhuma linha aparece. Há teste que tenta ler e alterar dados de outra conta pela API e direto no banco.
- **A taxa aplicada fica gravada na venda** (`fee_snapshot`), para o extrato nunca mudar depois.
- **Camada de pagamento isolada** (`PaymentProvider`): trocar de fornecedor, ou usar dois, é escrever outro adaptador. O número do cartão nunca chega à API — só o token do campo do provedor.
- **CPF, CNPJ e chave Pix com criptografia por campo** (AES-256-GCM) e índice cego para busca.
- **Sessão do botão "Acessar meu produto" é limitada àquele pedido.** O acesso completo exige o código enviado ao e-mail: assim, comprar com o e-mail de outra pessoa não abre as compras dela.
- **Idempotência** em toda criação (`Idempotency-Key`), **segundo fator** em saque, troca de chave Pix e criação de chave de API, e **trilha de auditoria** imutável.
- **Fila no próprio processo da API** (e-mails, webhooks, liberações, Pix vencido). Serve para começar; com volume, vira um serviço separado.

## Escolhas que precisam de confirmação

Onde o descritivo não define, foi adotado o seguinte — fácil de mudar:

1. **Reembolso devolve a taxa ao produtor.** A plataforma estorna a própria receita e o produtor devolve só o líquido.
2. **A reserva de 5% incide sobre o líquido da venda** e volta sozinha em 30 dias.
3. **Juros de parcelamento pela tabela Price**, com a parcela arredondada para cima.
4. **"Dia seguinte" e os prazos em dias viram à meia-noite de Brasília.**
5. **Triagem de produtos por regras de palavras-chave**, e não por modelo de linguagem. Aprova o que não bate em nenhuma regra; o resto vai para uma pessoa.
6. **Com o provedor simulado a verificação de identidade é aprovada na hora.** Em produção, a conta fica em análise até a resposta do provedor ou do backoffice.

## Antes de produção

- Escolher e integrar o provedor de pagamento (e o de reserva), antifraude e 3DS.
- Provedores de identidade, vídeo e WhatsApp.
- Parecer jurídico do capítulo 13 e os termos definitivos (`/termos` tem texto provisório).
- Limite de tentativas compartilhado entre instâncias (hoje é em memória), teste de carga e teste de invasão.
- Conferência diária entre o livro-razão e o extrato do provedor.
- Definir `FIELD_ENCRYPTION_KEY`, `BLIND_INDEX_KEY` e `SANDBOX_WEBHOOK_SECRET`: em produção a API não sobe sem elas.
- No Supabase, usar a conexão direta (o aviso em tempo real usa `LISTEN/NOTIFY`) e criar o papel `domma_app` antes das migrações.
