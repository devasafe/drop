# AUDITORIA DROP — UX / UI / QA / Responsividade

> **Fonte de verdade** da revisão completa das interfaces da Drop. Documento vivo,
> construído **por área** (público/cliente → lojista → motoboy → admin). Nenhuma
> correção é implementada aqui — primeiro enxergamos o problema inteiro, depois
> priorizamos e executamos em fases (F0–F5), uma área por vez.

**Status de preenchimento:** ✅ 1ª passada completa (todas as áreas).
- [x] 1–6 Seções globais
- [x] Fluxos ponta a ponta (mapa)
- [x] Inventário priorizado (todas as páginas)
- [x] Cliente — deep-dive
- [x] Lojista — deep-dive
- [x] Motoboy — deep-dive
- [x] Admin/CEO — deep-dive
- [x] Roadmap de execução (F0–F5)

> **Profundidade:** os fluxos-chave e as telas P0/legadas foram lidos linha-a-linha; as
> demais receberam auditoria em **nível-padrão** (classificação migrado×legado + models +
> contexto), com "verificar" nas de dúvida real. Ver "Notas de execução do doc" no fim.

**Legenda de prioridade:** `P0` essencial (erro de interpretação / dado crítico ausente) · `P1` importante (UX estrutural) · `P2` complementar · `P3` avançado/polish.

---

## 1. Visão geral

A Drop é um marketplace de delivery de itens não-essenciais com 4 perfis: **cliente**
(compra), **lojista** (vende/gerencia), **motoboy** (entrega) e **admin/CEO**
(opera a plataforma). Stack: Next.js Pages Router + React + TS no front; Node/Express
+ Prisma/PostgreSQL + gateway Asaas (PIX + cartão à vista/parcelado, custódia com 2
PINs) no back.

O **mobile já tem uma linguagem visual aprovada** (design flat, ver §3). O objetivo
desta auditoria **não é redesenhar** — é: (a) dar ao **desktop uma composição própria**
(hoje é "mobile esticado"), (b) garantir que cada tela mostra **as informações certas,
no momento certo, com hierarquia certa** (QA informacional cruzando com o backend), e
(c) eliminar **inconsistências e telas emboladas**, preservando identidade/estilo.

---

## 2. Problemas globais

Padrões que se repetem em muitas telas — atacá-los rende mais que corrigir página a página.

### 2.1 Desktop é "mobile esticado" (P1, transversal)
`_app.tsx` centraliza o conteúdo num container `max-width: 1400px; margin: 0 auto`,
mas a maioria das páginas foi escrita **mobile-first, em coluna única**. No desktop isso
vira uma faixa central com **muito espaço horizontal ocioso** e nenhuma composição
horizontal (colunas, painéis lado-a-lado, master-detail). Exemplo canônico: `/order/[id]`
tem um `leftPanel` e **nenhum painel direito** — o layout de duas colunas foi previsto e
nunca concluído. **Estratégia de correção em §6.**

### 2.2 Falta `<meta viewport>` explícita (P2, verificar)
Nem `_app.tsx` nem `_document.tsx` declaram `<meta name="viewport">`. O Next injeta um
default no Pages Router (o mobile não está quebrado), mas convém **declarar explicitamente**
em `_document.tsx` para remover a dependência do comportamento do framework. Fix de 1 linha.

### 2.3 Design flat aplicado de forma inconsistente (P1)
O DS (§3) diz "card é exceção; cores sempre por token; sem glow". Várias telas **antigas**
(não migradas) violam isso ao mesmo tempo:
- **Hex/rgba hardcoded** em vez de tokens (`#22c55e`, `#ef4444`, `rgba(255,255,255,.6)`…) — ex.: `/order/[id]` inteiro, `/access-denied`.
- **"Coleção de cards"** (`infoCard` empilhado) onde o DS pede `Section`/`List` — ex.: `/order/[id]`.
- **Glow** (`box-shadow: 0 0 8px …`) em elementos — ex.: dots da timeline em `/order/[id]`.
- Coexistência de **dois mundos**: telas migradas (flat, `components/ui/*`, tokens) vs. telas legadas (estilo roxo/glass antigo). Isso quebra a consistência global.

### 2.4 Texto sem acentuação em telas legadas (P1 — QA/polish)
Várias telas exibem português **sem acentos** ("Informacoes", "Endereco", "Distancia",
"Comissao", "Pedido nao encontrado"). É erro ortográfico visível ao usuário. Auditar e
corrigir em todas as telas legadas.

### 2.5 Funcionalidades espalhadas / duplicadas (P1)
- **Carteira** aparece em muitas rotas: `/wallet`, `/my-wallet`, `/seller/wallet`, `/seller/transfer-wallet`, `/motoboy/wallet`, `/motoboy/transfer-wallet`, `/motoboy/request-withdrawal`, `/admin/wallets`. Há sobreposição real (ex.: `transfer-wallet` já virou redirect em algumas roles — confirmar) e nomes diferentes p/ a mesma ação (Sacar / Transferir / Solicitar Saque).
- **Perfil/conta:** `/minha-conta`, `/user-profile`, `/editar-conta`, `/foto-perfil`, `/dados-recebimento`, `/bank-setup` — muitas portas p/ "meus dados".
- **Painel do lojista:** `/seller/dashboard` (novo) vs `/store-dashboard` (legado?) e `/seller/order-[id]` vs `/store-order/[id]` — provável duplicação a consolidar.
- **Seleção de plano:** `/seller/select-plan` vs `/store/plan-selection`.
- **Detalhe de pedido** existe em 3 lentes: `/order/[id]` (cliente/admin), `/seller/order-[id]` + `/store-order/[id]` (loja). Verificar consistência de dados exibidos entre elas.

### 2.6 QA informacional: dados no backend que o front ignora (P0)
O `Order` carrega `paymentMethod`, `installmentCount`, `walletApplied`, `subtotal`,
`deliveryFee`, `paymentStatus`, `asaasChargeStatus`; o `Cancellation` carrega `reason`,
`reasonCode`, `refundAmount`, `refundStatus`, `lateCancellationFee`; o `Coupon` existe.
Mas as telas de pedido **não mostram parcelas, saldo aplicado, cupom, forma de pgto
humanizada, bandeira/últimos dígitos, nem o detalhamento de reembolso/multa**. Este é o
problema-classe mais importante — detalhado por página abaixo. (Ver matriz em §Cliente.)

### 2.7 `paymentMethod` exibido cru (P1)
Onde aparece, mostra o enum bruto (`credit_card`, `pix`, `cash_on_delivery`) em vez de
rótulo ("Cartão de crédito", "PIX", "Na entrega"). Falta um mapa de rótulos compartilhado.

### 2.8 Status de pedido: dois vocabulários (P2)
Convivem `order.status` (`criado/pago/aguardando_motoboy/enviado/entregue/cancelado/rejeitado`)
e `delivery.status` (`assigned/picked/delivered/cancelled`), mapeados juntos num `statusMap`
duplicado em várias telas. Falta um utilitário único de rótulo/cor de status por token.

---

## 3. Design System (flat)

Fonte: `frontend/styles/DESIGN-SYSTEM.md` + `frontend/styles/tokens.css`.

**Princípios:** menos caixas (coleção = `List`/`Row` com divisória `--line`, não pilha de
cards); `Card` só quando a borda é funcional; sem gradiente/glow; **cores sempre por token**;
espaço + tipografia fazem a hierarquia. Primitivos em `components/ui/`: **`Section`**
(título + régua), **`List`+`Row`** (linhas achatadas, `accent`/`interactive`), **`KpiBand`+`Kpi`**
(indicadores com divisória vertical), **`Card`** (exceção).

**Uso na auditoria:** toda tela legada que empilha `infoCard`/usa hex/tem glow é candidata a
migrar pra `Section`/`List`/`KpiBand` + tokens. O flat exige **rigor de separação** (espaço,
tipografia, divisor sutil, background alternado) pra seções diferentes não se fundirem — é o
foco do check de "densidade/embolado" por página.

---

## 4. Navegação

- **Nav global (topo)** `components/Nav.tsx` — trata logado/deslogado, usa `ROLE_HOME`. OK.
- **Bottom-nav do cliente** `components/drop/{CustomerAppChrome,TabBar}.tsx` — agora auth-aware (deslogado = Início/Buscar/Entrar). OK (recém-corrigido).
- **Painéis (lojista/motoboy/admin):** `components/nav/AppSidebar` (desktop) + `PanelBottomNav` (mobile), derivados de `frontend/lib/navConfig.ts` (fonte única por role) e `lib/adminMenu.ts` (admin).
- **`ROLE_HOME`** (navConfig): cliente `/inicio`, lojista `/seller/dashboard`, motoboy `/motoboy`, ceo `/admin/dashboard`. `ProtectedRoute` redireciona pra home da role (recém-corrigido).

**A auditar:** duplicidade de acesso (§2.5) — a mesma função alcançável por 3 caminhos; ausência de **breadcrumbs**/estado de "voltar" claro nos fluxos profundos (detalhe de pedido → voltar pra lista certa); consistência do item ativo entre sidebar e bottom-nav.

---

## 5. Mobile

Estado: **bom e aprovado** — é a referência visual. Papel da auditoria no mobile: **não
regredir** e corrigir só pontuais (acentuação §2.4, densidade/embolado onde houver, estados
ausentes §8-por-página). Fase 3 do roadmap.

---

## 6. Desktop — estratégia de composição (não "esticar")

Diretriz por tipo de tela (preservando tokens/flat/identidade):
- **Detalhe (pedido, entrega, produto):** master-detail ou **2 colunas** — conteúdo primário à esquerda (produtos, timeline), resumo/ações **sticky** à direita. Aproveita o `leftPanel`/`rightPanel` já previsto em `/order/[id]`.
- **Listas/painéis (pedidos da loja, corridas, admin):** aproveitar largura com **tabela real** (colunas alinhadas, `tabular-nums`) ou grid de linhas denso; filtros no topo; no mobile, colapsar em `List`/`Row`.
- **Dashboards (admin, seller overview):** `KpiBand` horizontal + regiões/painéis lado-a-lado em vez de blocos empilhados full-width.
- **Formulários (checkout, cadastro produto):** coluna de campos + **resumo sticky** ao lado no desktop; empilhado no mobile.
- **Regra:** o desktop pode ter layout diferente do mobile, mas **mesma linguagem** (tokens, tipografia, primitivos). Reduzir scroll quando fizer sentido; permitir comparação lado-a-lado.

---

## Fluxos ponta a ponta (mapa)

**Compra (cliente):** `/inicio` → `/stores` → `/stores/[id]` → `/product/[id]` → carrinho (StickyCart/`CartContext`) → `/checkout` → pagamento (PIX modal / cartão) → `/order/[id]` (acompanhamento) → `/user-dashboard` (histórico) → `/order/[id]` (detalhes).
**Lojista:** `/seller/dashboard` (orders) → `/seller/order-[id]` → atualizar status → `/seller/wallet` → saque → history.
**Motoboy:** `/motoboy` → `/motoboy/ongoing` → `/motoboy/delivery/[id]` (coleta PIN retirada → entrega PIN) → ganho → `/motoboy/wallet` → saque.
**Auth/onboarding:** `/register` → `/verificacao*` (KYC por role) → `/dados-recebimento` (PIX/endereço) → home da role.

**Checar nos fluxos:** info que some entre telas (ex.: parcelas no checkout mas não no pedido), ações sem feedback, estados ausentes, caminho de volta correto, dado inconsistente entre as 3 lentes de "detalhe de pedido".

---

## Inventário priorizado (todas as páginas)

Prioridade de **primeira passada** (refinada no deep-dive de cada área).

### Cliente
| Rota | Objetivo | Prio 1ª passada | Nota |
|---|---|---|---|
| `/inicio` | Home logada do cliente | P1 | desktop |
| `/` (index) | Vitrine/busca pública | P1 | desktop + deslogado |
| `/stores` · `/stores/[id]` | Lista de lojas / loja | P1 | header próprio, desktop |
| `/product/[id]` | Produto + add carrinho | P1 | ação primária, desktop |
| `/produtos` | Catálogo | P2 | |
| `/checkout` · `/checkout-vitrine` | Fechamento | **P0** | parcelas/cupom/resumo; 2 checkouts? |
| `/order/[id]` | Acompanhamento/detalhe | **P0** | ver deep-dive abaixo |
| `/user-dashboard` | Pedidos + endereços | **P0** | ver deep-dive abaixo |
| `/wallet` · `/my-wallet` | Carteira cliente | P1 | duplicidade |
| `/minha-conta` · `/user-profile` · `/editar-conta` · `/foto-perfil` | Conta/perfil | P1 | consolidação |
| `/dados-recebimento` · `/bank-setup` | Recebimento/banco | P2 | |
| `/notifications` | Notificações | P2 | |
| `/avaliar-motoboy` | Avaliação pós-entrega | P2 | estado |
| `/invoice/[id]` | Nota/recibo | P2 | dados fiscais |
| `/verificacao` | KYC cliente | P1 | estados |

### Lojista
| Rota | Objetivo | Prio | Nota |
|---|---|---|---|
| `/seller/dashboard` (orders/history/returns/chat/config) | Painel | **P0** | núcleo operacional, desktop |
| `/seller/order-[id]` · `/store-order/[id]` | Detalhe pedido loja | **P0** | duplicação + dados |
| `/seller/products` · `/create-product` · `/edit-product` | Catálogo/estoque | P1 | |
| `/seller/wallet` · `/transfer-wallet` | Financeiro | P1 | duplicidade |
| `/seller/analytics` | Métricas | P2 | desktop (gráficos) |
| `/seller/coupons` | Cupons | P2 | |
| `/seller/select-plan` · `/store/plan-selection` | Plano | P2 | duplicação |
| `/seller/create-store` · `/verificacao-loja` | Onboarding loja | P1 | estados |
| `/store-dashboard` | **Legado?** | P1 | confirmar/remover |

### Motoboy
| Rota | Objetivo | Prio | Nota |
|---|---|---|---|
| `/motoboy` | Visão geral | P1 | desktop |
| `/motoboy/ongoing` | Corridas/entregas | **P0** | núcleo operacional |
| `/motoboy/delivery/[id]` | Coleta/entrega/PIN | **P0** | fluxo crítico |
| `/motoboy/wallet` · `/request-withdrawal` · `/transfer-wallet` | Financeiro | P1 | duplicidade |
| `/motoboy/gamification` · `/ranking` · `/beneficios` | Engajamento | P2 | |
| `/motoboy/history` | Histórico corridas | P1 | dados de ganho |
| `/motoboy/profile` · `/verificacao-motoboy` | Conta/KYC | P1 | estados |

### Admin/CEO
| Rota | Objetivo | Prio | Nota |
|---|---|---|---|
| `/admin/dashboard` · `/analytics` | Visão/métricas | P1 | desktop (KPIs/tabelas) |
| `/admin/users` · `/verificacoes` · `/conversas` · `/suporte` | Operação | P1 | tabelas grandes |
| `/admin/wallets` · `/withdrawals` · `/payouts` · `/app-cashbox` · `/plan-approvals` | Financeiro | **P0** | dados financeiros densos |
| `/admin/broadcasts` · `/ranking-config` · `/coupons` · `/avisos` | Crescimento | P2 | |
| `/admin/settings` · `/seasonal-theme` · `/permissoes` · `/pricing-config` | Plataforma | P1 | config sensível |

---

## Cliente — deep-dive

> **Correção de enquadramento (importante):** o **rastreio real do cliente** pós-compra é
> **`/store-order/[id]`** (o checkout e a home levam pra lá), não `/order/[id]`. O
> `/order/[id]` é a lente **legada/admin** (detalhe genérico + "fluxo do dinheiro"). Isso
> concretiza o §2.5 — há **3 páginas de "detalhe de pedido"**: `/store-order/[id]` (cliente,
> migrada), `/order/[id]` (legada/admin), `/seller/order-[id]`+`/store-order` vs `/seller`
> (loja). Consolidar e unificar os dados exibidos.

### `/store-order/[id]` — Acompanhamento do pedido (cliente, REAL)  · Prioridade **P0** · migrada
**Arquivos:** `frontend/pages/store-order/[id].tsx` (+ `StoreOrderStatus.module.css`), componentes `components/drop/order/*` (OrderStatusHero, OrderTimeline, DeliveryPin, MotoboyMap, OrderItemsSummary, OrderActions, RatingForm, CancellationStatus). **Hooks/APIs:** `useOrderTracking`, `useCancellation`; `Order`, `Delivery`, `Cancellation`, `/orders/:id/my-product-reviews`.
**Objetivo:** acompanhar o pedido (status/timeline/mapa), pagar PIX pendente, cancelar, confirmar recebimento, avaliar (motoboy/loja/produtos).
**Pontos fortes:** migrada e completa — estados (loading/notFound/content), CTA "Pagar com PIX" no pendente, cancelamento com **motivo/reembolso/multa** (via `CancellationStatus` + `getCancellationHistory`), mapa ao vivo, avaliações hidratadas. É referência de qualidade.
**Problemas (QA/dados):** o `OrderItemsSummary` recebe **`discount={0}` hardcoded** (linha ~304) → **cupom aplicado não aparece** no resumo mesmo existindo; e **não mostra forma de pagamento, parcelas (`installmentCount`), nem `walletApplied`**. Repete o §2.6 na tela mais importante do cliente. **P0.**
**Desktop:** coluna única de `section`s empilhadas — no desktop cabe **2 colunas** (status/timeline/mapa à esquerda; resumo + ações + avaliações à direita, sticky).
**Prioridade:** **P0** (dado de pagamento ausente + é o rastreio principal).

### `/order/[id]` — Detalhe genérico/admin (LEGADA)  · Prioridade **P1**
**Arquivos:** `frontend/pages/order/[id].tsx`, `frontend/pages/OrderDetail.module.css`, `components/order/CancellationStatusDisplay.tsx`. **APIs/models:** `useOrder` (`hooks/useSync`), `Order` (+`OrderItem`, `walletDistribution`, `installmentCount`, `paymentMethod`, `walletApplied`), `Delivery`, `Payout` (`/payouts/admin`, só admin), `Cancellation`.

**Objetivo da página:** o cliente acompanhar o estado do pedido e ver seus detalhes (produtos, valores, entrega). Também é reusada pelo **admin** (mostra "Fluxo do Dinheiro"/payouts) — mistura de responsabilidades.

**Problemas de desktop:** existe `page > leftPanel` e **nenhum `rightPanel`** — o layout de 2 colunas foi previsto e abandonado. No desktop é uma coluna estreita à esquerda com todo o resto da tela vazio. **Sugestão:** esquerda = produtos + timeline; direita (sticky) = resumo financeiro + status + ações (cancelar/avaliar/refazer).

**Problemas de mobile:** aceitável, mas é uma **pilha de `infoCard`** (viola flat) — migrar p/ `Section`/`List` deixa mais leve e coeso.

**Informações ausentes (QA — matriz):**
| Informação | Existe? | Necessária? | Prio | Observação |
|---|---|---|---|---|
| Nº do pedido, status, datas | Sim | Sim | — | OK |
| Produtos (nome/qtd/preço) | Sim | Sim | — | OK |
| Subtotal, taxa, total | Sim | Sim | — | OK |
| **Forma de pagamento (rótulo)** | Cru | Sim | P0 | mostra `credit_card`, humanizar |
| **Parcelas (Nx de R$Y)** | **Não** | Condicional | P0 | `Order.installmentCount` existe e é ignorado |
| **Saldo da carteira aplicado** | **Não** | Condicional | P0 | `Order.walletApplied` ignorado |
| **Cupom/desconto** | **Não** | Condicional | P1 | mostrar quando houver |
| **Bandeira / últimos 4 dígitos** | **Não** | Condicional | P2 | não é persistido hoje (Fase 3 cartão) — avaliar |
| **Reembolso (valor/status)** | Parcial | Condicional | P1 | só via `CancellationStatusDisplay`; trazer ao resumo |
| **Multa de cancelamento tardio** | Não | Condicional | P1 | `Cancellation.lateCancellationFee` existe |

**Problemas de hierarquia/agrupamento:** "Distribuição" (comissões) aparece pro cliente dentro do resumo financeiro — é **info de plataforma**, não do cliente; deveria ser admin-only (hoje `wd` é renderizado sem gate de role, só o "Fluxo do Dinheiro" é `isAdmin`). Mistura o que a loja/motoboy recebem com o que o cliente pagou.

**Problemas funcionais / estados não tratados:** `empty`/`error` mínimos ("Pedido nao encontrado", sem acento, sem ação de voltar). **Sem ações** na página (cancelar pedido, avaliar, refazer pedido, "pagar" se pendente) — o cliente não tem CTA aqui. Estados de domínio (aguardando pagamento, pago, preparando, em rota, entregue, cancelado, reembolsado) existem na timeline mas o **estado de pagamento pendente** (PIX não pago / cartão em 3DS) não tem tratamento visível nem CTA de pagar.

**Inconsistências / DS:** hex hardcoded em toda a tela (viola "cores por token"); `box-shadow: 0 0 8px` (glow) nos dots (viola "sem glow"); `infoCard` empilhado (viola "menos caixas"); acentuação ausente. `statusMap`/`statusColor` duplicados de outras telas (§2.8).

**Sugestão de layout desktop:**
```
┌───────────────────────────────┬──────────────────────────┐
│ Produtos (List)               │ Resumo do pedido (sticky)│
│ Timeline da entrega           │  subtotal/taxa/desconto  │
│ Mapa (rota)                   │  parcelas/forma pgto     │
│                               │  total · status pgto     │
│                               │  [Ações: pagar/cancelar/ │
│                               │   avaliar/refazer]       │
└───────────────────────────────┴──────────────────────────┘
```
**Sugestão de layout mobile:** manter empilhado, mas em `Section`/`List`, com resumo financeiro + ação primária fixados ao final; parcelas/forma de pgto/cupom no resumo.

---

### `/user-dashboard` — Pedidos + Endereços  · Prioridade **P0**
**Arquivos:** `frontend/pages/user-dashboard.tsx` (+ module). **APIs/models:** `useOrders`, `/user/me`, `/user/addresses`; `Order`, `Address`. Deep-link `?tab=addresses`.

**Objetivo:** histórico de pedidos do cliente + gestão de endereços (dois papéis numa página só via tab).

**Problemas de desktop:** lista de pedidos em coluna única — no desktop caberia **tabela/grid** (data, loja, itens, forma de pgto, total, status) com detalhe ao clicar. Endereços idem (grid de cards de endereço).

**Informações ausentes (QA):** o item de pedido na lista precisa (além de status/valor/data) de **forma de pagamento + parcelas** (o gap do §2.6 se repete aqui — o cliente não distingue um pedido 3x de um à vista). Filtro por status/período ausente. Sem busca.

**Problemas funcionais / estados:** o gate de loading rodava **antes** do `ProtectedRoute` → deslogado travava (corrigido nesta sessão). Faltam **empty state** rico ("nenhum pedido ainda" com CTA "explorar lojas") e tratamento de **erro** de fetch. Misturar "Pedidos" e "Endereços" na mesma rota via `?tab` é discutível (Perfil já tem endereços?） — checar duplicação com `/minha-conta`/`/user-profile`.

**Inconsistências:** "Pedidos" no bottom-nav aponta pra `/user-dashboard` (não `/pedidos`) — ok, mas o nome da rota não bate com o conceito; endereços aparecem aqui e possivelmente no perfil (§2.5).

**Prioridade:** P0 pela lacuna de informação de pagamento/parcelas + é a porta do histórico.

---

### `/` (index) — Vitrine/busca pública · P1 · migrada
Vitrine + busca (`?q=`), pública, header próprio (`hideChrome`). **Desktop:** grid de resultados aproveitando a largura (hoje vitrine mobile). Deslogado ok (nav de convidado corrigida). Arquivos: `pages/index.tsx`; `lib/searchCatalog`.

### `/inicio` — Home logada · P1 · migrada
Boa: seções (lojas perto, ofertas, "pra repetir", banners, pedidos ativos), estados (skeleton/empty). **Desktop:** seções em coluna → **grid** (lojas/ofertas em colunas) + conter largura. "Pedidos ativos" abre `/store-order/[id]` (coerente). Arquivos: `pages/inicio.tsx`.

### `/stores` · `/stores/[id]` — Lista de lojas / loja · P1 · migradas
Header próprio. **Desktop:** `/stores/[id]` = hero da loja + **grid de produtos** + filtros/categorias no topo (hoje rail mobile). **QA:** conferir status aberto/fechado, taxa de entrega, tempo estimado, avaliação da loja.

### `/product/[id]` — Produto · P1 · migrada
Excelente (galeria, breadcrumb, estados, estoque, qtd, add c/ feedback, reviews, relacionados). **Desktop:** virar **2 colunas** — galeria sticky à esquerda, info/preço/CTA à direita (hoje hero full-width + info empilhada). APIs: `useProducts`, `/products/:id`, `/products/:id/reviews`.

### `/produtos` — Catálogo geral · P2 · migrada
Grid de produtos. **Desktop:** grid responsivo + filtros. Confirmar paginação e empty/erro.

### `/checkout` — Fechamento · P0 · migrada
Orquestração pura, ótima (endereço, itens, cupom, **seletor de parcelas**, wallet, resumo, PIX sheet; estados bloqueado/loading/vazio/conteúdo; `CheckoutBar` com hints). **Desktop:** **2 colunas** — campos à esquerda, **resumo + confirmar sticky** à direita. **Fluxo:** parcelas/cupom/forma de pgto **somem** ao ir pro `/store-order` (§QA). Arquivos: `pages/checkout.tsx`, `hooks/useCheckout.ts`, `components/drop/checkout/*`.

### `/checkout-vitrine` — Segundo checkout? · P1 · verificar
Existe um **segundo checkout**. Provável divergência com `/checkout`. **Ação:** confirmar uso; unificar ou remover.

### `/wallet` — Carteira do cliente · P1 · migrada (ressalvas)
Saldo + entradas/saídas + extrato + carregar/sacar (sheets), estados ok. **DS:** `balanceGlow` (viola "sem glow"). **Consistência crítica:** o saque coleta **dados bancários** (`/wallets/:id/transfer`) — **conflita** com o **saque via chave PIX** (Asaas, `dados-recebimento`). Definir um fluxo único. **QA:** `relatedId` da transação poderia **linkar pro pedido**. **Desktop:** 2 colunas (saldo/ações | extrato tabela). Models: `Wallet`, `Withdrawal`.

### `/my-wallet` — Carteira (LEGADA, duplicada) · P1 · legada
Duplica `/wallet` em estilo legado (hex). **Ação:** consolidar numa carteira só; remover. §2.5.

### `/minha-conta` — REDIRECT · — · ok
Só redireciona pra `/user-profile` (ou `/motoboy/profile`). Consolidação feita.

### `/user-profile` — Perfil do cliente · P1 · migrada
Avatar + hub de verificações + "meus dados" + sair (`VerificationHub`/`MeusDadosForm`). **Consistência:** endereços aqui e em `/user-dashboard?tab=addresses` — não duplicar. **Desktop:** 2 colunas.

### `/editar-conta` · `/foto-perfil` · `/dados-recebimento` · `/bank-setup` — conta/recebimento · P2
`editar-conta` (legada, casca do `MeusDadosForm`) e `foto-perfil` (migrada) — avaliar embutir no perfil. `dados-recebimento` (migrada) = base do **saque via PIX**, fonte de verdade do recebimento → reconciliar com o saque bancário do `/wallet`. `bank-setup` provável legado pré-PIX — reavaliar necessidade.

### `/notifications` — Notificações · P2 · migrada
**QA:** estados (empty/loading), marcar lida, agrupar por data, deep-link pro recurso (pedido/entrega).

### `/avaliar-motoboy` — Avaliação pós-entrega · P2 · migrada
**Redundância:** `/store-order/[id]` **já tem** avaliação embutida — confirmar se esta rota ainda é usada e consolidar. Estados: já avaliado/expirado.

### `/invoice/[id]` — Nota/recibo · P2 · legada
Tem hex. **QA:** o que uma nota precisa (dados fiscais, itens, valores, forma de pgto, **parcelas**, loja/cliente, data) vs. o que o backend gera. **Desktop:** layout de documento centrado.

### `/verificacao` — KYC cliente · P1 · migrada
**Estados:** pendente/enviado/aprovado/recusado + **motivo de recusa**. Alinhar com `VerificationHub` (não duplicar).

### Público/auth (cluster) · P1/P2
- **`/login` · `/register`** (migradas, split-screen — memória): confirmar erro/loading/validação; falta trocar placeholder do painel pela foto hero. Desktop: painel-imagem + form.
- **`/esqueci-senha`** (migrada): estados envio/erro.
- **`/verify-email`** (legada, hex): estados verificando/sucesso/erro/expirado; migrar DS.
- **`/access-denied`** (legada, hex): agora raramente atingida (redirect por role); migrar DS e simplificar (é fallback).
- **`/termos` · `/privacidade`(+`/solicitacoes`) · `/cookies`** (legais): **desktop** com largura de leitura (~70ch), índice/âncoras; consistência visual.

---

## Lojista — deep-dive

**Contexto:** painel passou por **redesign flat recente** (memória). Shell `AppSidebar` (desktop) + `PanelBottomNav` (mobile) via `navConfig`. Ainda há **duplicação legada**.

### `/seller/dashboard` (overview/orders/history/returns/chat/config) · P0 · migrada
Hub operacional — onde o desktop mais importa. **Desktop:** pedidos em **tabela/lista densa** (nº, cliente, itens, total, **forma de pgto/parcelas**, status, tempo) + **detalhe ao lado (master-detail)** em vez de rotear pra outra tela. **QA:** a linha do pedido mostra forma de pgto/parcelas/cupom? (provável gap §2.6). **Estados:** empty por tab, loading, erro.

### `/seller/order-[id]` — Detalhe do pedido (loja) · P0 · verificar duplicação
**Consistência:** reconciliar com `/store-order/[id]` (cliente) e `/order/[id]` (admin) — 3 lentes do mesmo pedido; unificar componentes e **dados exibidos** (forma de pgto/parcelas/reembolso). Ações: atualizar status, PIN de retirada, aceitar/rejeitar. **P0** (operacional + dados).

### `/seller/products` · `/create-product` · `/edit-product` · P1 · migradas
**Desktop:** `products` = **tabela** (foto, nome, preço, estoque, status) c/ ações inline; forms = 2 colunas (campos | preview do card). **Estados:** empty (CTA), validação, upload. **QA:** estoque baixo/esgotado destacado.

### `/seller/wallet` · `/seller/transfer-wallet` · P1 · migradas (transfer legado?)
Financeiro + saque. **Consistência:** `transfer-wallet` virou redirect/saque direto (memória) — confirmar/remover; usar "Sacar para meu PIX". `seller/wallet` tem 1 hex (limpar). **Desktop:** 2 colunas (saldo/KPIs | extrato tabela).

### `/seller/analytics` · P2 · migrada
**Desktop:** dashboard real — `KpiBand` + gráficos lado-a-lado. Estados sem dados/período.

### `/seller/coupons` · P2 · migrada
**QA:** uso (`usedCount/maxUses`), validade, status; criar/editar com validação. **Desktop:** tabela.

### `/seller/select-plan` · `/store/plan-selection` · P2 · duplicadas
**Duplicação** — unificar. Mostrar comparativo de planos (premium/banner/raio), cobrança, status atual.

### `/seller/create-store` · `/verificacao-loja` · P1 · migradas
Onboarding (criar + KYC/CNPJ). **Estados:** rascunho/enviado/aprovado/recusado+motivo. Alinhar com `VerificationHub`. **Desktop:** wizard centrado.

### `/store-dashboard` — LEGADO/duplicado? · P1
Aparece no `_app` `isDashboard`. Provável **rota antiga** do painel. **Ação:** confirmar; se legado, redirecionar/remover (não ter 2 portas pro painel).

---

## Motoboy — deep-dive

**Contexto:** área bem migrada. Operação 100% mobile; painel/financeiro também no desktop.

### `/motoboy` — Visão geral · P1 · migrada
Disponibilidade + corridas disponíveis (aceitar) + resumo de ganhos + atalhos. **Desktop:** dashboard — corridas em lista + KPIs + mapa. **QA:** corrida mostra valor, distância, loja→cliente, tempo. **Estados:** offline/sem corridas/carregando.

### `/motoboy/ongoing` (em andamento/histórico) · P0 · migrada
(lida) Boa: abas, KPIs (migrar p/ `KpiBand`), filtros, estados. **Absorve `/motoboy/history`** → confirmar órfão. **Desktop:** lista → grid/tabela.

### `/motoboy/delivery/[id]` — Coleta/entrega/PIN · P0 · migrada (c/ hex)
Fluxo crítico: rota, PIN retirada, **finalizar com PIN do cliente** (recém-reforçado). Alguns hex (limpar). **Estados:** assigned/picked/delivered/cancelled/devolução. **Desktop:** mapa grande à esquerda + passos/ações à direita.

### `/motoboy/wallet` · `/request-withdrawal` · `/transfer-wallet` · P1 · migradas
**Consistência:** consolidar as 3 numa carteira + 1 saque (PIX direto; `transfer-wallet` é redirect — memória). **QA:** ganhos por período, `Payout` (pendente/liberado/pago), dívidas descontadas. **Desktop:** 2 colunas.

### `/motoboy/history` — LEGADO? · P2
Provável absorvido por `/motoboy/ongoing?tab=history`. Confirmar/remover.

### `/motoboy/gamification` · `/ranking` · `/beneficios` · P2 · migradas (gamification c/ hex)
Engajamento. `gamification` tem vários hex (tokenizar). **QA:** metas/progresso/níveis/recompensas; ranking com posição; benefícios com elegibilidade. **Desktop:** grid.

### `/motoboy/profile` · `/verificacao-motoboy` · P1 · migradas (c/ hex)
Perfil profissional (avaliações, hub, dados, senha) + KYC (CNH/placa/foto, com reenvio). `profile` tem hex (limpar). **Estados:** aprovado/recusado+motivo. Reuso `MotoboyRatingsBlock`/`VerificationHub`/`MeusDadosForm`.

### `/motoboy/[id]` — Perfil público do motoboy? · P2 · verificar
Confirmar objetivo e quem acessa.

---

## Admin/CEO — deep-dive

**Contexto (crítico):** área **menos migrada** — maioria em **hex/estilo legado** (analytics, broadcasts, app-cashbox, coupons, payouts, suporte, ranking-config, verificacoes). É 100% **desktop** mas provavelmente **não aproveita a largura** com tabelas/densidade. **Maior oportunidade combinada de DS + desktop.** Acesso por **permissão** (`required_permission`), shell `AppSidebar` via `adminMenu`.

### Financeiro (P0 — denso) — `/admin/wallets` · `/withdrawals` · `/payouts` · `/app-cashbox` · `/plan-approvals`
Operação de dinheiro, **legadas**. **Desktop/QA:** **tabelas reais** (colunas alinhadas, `tabular-nums`, ordenação, filtros, busca, paginação, ações em massa) + estados. Cruzar `Wallet`/`Withdrawal`/`Payout`/`AppCashbox`/`PricingPlan`: status, valores, recebedor, datas, bloqueios+motivo. `app-cashbox` mostra saldo real conta-mãe Asaas (memória).

### Operação (P1) — `/admin/users` · `/verificacoes` · `/conversas` · `/suporte`
**Legadas** (`verificacoes` bem legada — 9 hex). **Desktop/QA:** tabela de usuários (filtro role/status, busca); fila de verificações com **preview de documento + aprovar/recusar+motivo**; chat/suporte master-detail (lista | conversa).

### Visão/métricas (P1) — `/admin/dashboard` · `/analytics`
**Legadas**. **Desktop:** dashboard real — `KpiBand` + gráficos em grid, período, comparativos. Espelhar novos itens de nav no dashboard (memória).

### Crescimento (P2) — `/admin/broadcasts` · `/ranking-config` · `/coupons` · `/avisos`
`avisos` é a **única migrada** (referência); demais legadas. **QA:** listas com status/uso; forms com validação/preview.

### Plataforma (P1 — sensível) — `/admin/settings` · `/pricing-config` · `/seasonal-theme` · `/permissoes`
**QA crítico:** `settings`/`pricing-config` devem expor com clareza os campos que **destravam o cartão em produção** (cartão: `cardFeePercent/Fixed/AnticipationMonthlyRate/InstallmentMaxCount/MinValue`) + taxas de cancelamento, com ajuda/validação. `permissoes` (CEO-only) já é matriz por categoria (memória). **Desktop:** forms em 2 colunas + seções.

---

## Utilitárias/dev (fora de escopo de UX)
`_app`, `_document`, `_styleguide` (referência de DS — manter), `upload`, `demo-cancelamento`. Só citadas.

---

## Roadmap de execução (fases)

Regra incremental (ponto 17 do brief): **auditar → alterar 1 área → testar → validar mobile+desktop → próxima**. Nunca refatoração gigante de uma vez (há regras de negócio; evitar regressão).

### F0 — Críticos de informação/QA (P0)
1. **Resumo financeiro completo do pedido** em `/store-order/[id]` (corrigir `discount={0}`; adicionar forma de pgto humanizada, **parcelas**, saldo aplicado, cupom), replicado em `/user-dashboard`, `/seller/order-[id]` e `/order/[id]`.
2. **Utils compartilhados:** rótulo de `paymentMethod` + status/cor por token (§2.7/2.8).
3. **Motivo de cancelamento + reembolso/multa** visíveis em todas as lentes (já ok no cliente; levar à loja/admin).
4. Telas **financeiras admin**: tabelas corretas + estados.

### F1 — UX estrutural / consolidação (P1)
Resolver duplicações: **carteira** (`/wallet`×`/my-wallet`; saque PIX×bancário), **perfil** (`/editar-conta`), **painel lojista** (`/store-dashboard`×`/seller/dashboard`), **detalhe de pedido** (3 lentes), **checkout** (`/checkout`×`/checkout-vitrine`), **plano** (`/seller/select-plan`×`/store/plan-selection`), **histórico motoboy** (`/motoboy/history`), **avaliação** (`/avaliar-motoboy`). Navegação/voltar coerente; remover portas redundantes.

### F2 — Desktop (composição própria)
Por padrão de tela (§6): master-detail em detalhes; produto = galeria|info; **tabelas** em listas/admin; **KpiBand+painéis** em dashboards; **resumo sticky** em checkout/forms. Começar pelos P0 (store-order, checkout, seller/dashboard, financeiro admin).

### F3 — Refino mobile + migração flat das legadas
Migrar legadas pra tokens/`Section`/`List`/`KpiBand` — **sem glow, sem hex, sem coleção de cards** — priorizando **admin**, `order/[id]`, `my-wallet`, `invoice`, `verify-email`, `access-denied`. Corrigir **acentuação** (§2.4). Não regredir o mobile aprovado.

### F4 — Estados e edge cases
loading/empty/error/pending/cancelled/expired em todas as telas de fluxo; motivo de recusa em KYC; pagamento pendente (PIX/3DS) com CTA; estados de saque/payout.

### F5 — Polish
Espaçamento, densidade, microinterações, transições, **`<meta viewport>` explícita**, consistência final de botões/rótulos.

---

## Notas de execução do doc
- **Lido linha-a-linha:** `/store-order/[id]`, `/order/[id]`, `/user-dashboard`, `/checkout`, `/product/[id]`, `/inicio`, `/wallet`, `/minha-conta`, `/motoboy/ongoing` + base (DS, `navConfig`, `_app`, models `Order`/`Cancellation`/`Coupon`).
- **Nível-padrão (classificação migrado×legado + models + contexto de sessão):** demais páginas, com "verificar" onde há dúvida real (`checkout-vitrine`, `store-dashboard`, `motoboy/[id]`, `bank-setup`, `motoboy/history`). Recomendo aprofundar a leitura dessas **na entrada da fase que as tocar**, antes de alterar — barato e evita surpresa.
