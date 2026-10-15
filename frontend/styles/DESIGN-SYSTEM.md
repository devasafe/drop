# Design System DROP v2

Fonte da verdade do estilo visual. Spec completa: `docs/superpowers/specs/2026-10-07-drop-ds-v2-design.md`
(seções 4 a 7). Tokens em `styles/tokens.css`; catálogo vivo em `/_styleguide` (só em dev).

O idioma é **flat e funcional**: superfície plana, hierarquia por tipografia e divisória fina, o card
como exceção. Sem gradiente, sem glow, sem sombra colorida. O roxo é ação, não decoração.

## 1. Camadas de token

```
Primitiva   --purple-*, --gray-*, --green-*, --amber-*, --red-*, --blue-*   (nunca em componente)
   ↓
Semântica   --color-*, --text-*, --radius-*, --elevation-*, --motion-*, --touch-min, --focus-ring-*
   ↓
Tema        :root / [data-theme="light"]  ·  [data-theme="dark"]  ·  body.theme-<sazonal> (só ação)
```

- **Componente lê só a camada semântica.** Nunca primitiva, nunca hex. Exceções: `tokens.css` e `globals.css`.
- `--space-*` (base 4) e `--font-display` / `--font-body` continuam valendo.
- Tipografia é shorthand: `font: var(--text-body)`. Mínimo absoluto 12px (`--text-caption`). Os `--fs-*` do v1 acabaram.
- Números sempre em `tabular-nums`.

### Tema por rota

- `lib/routeTheme.ts` define `LIGHT_ROUTES` (padrões de `router.pathname`, ex.: `/_styleguide`, `/stores/[id]`).
  Rota listada fica **clara**; o resto fica **escura**. A fase C adiciona a tela aqui quando ela é migrada.
- O `_document` aplica o tema num script inline antes da pintura (sem piscar) e o `_app` troca em `routeChangeComplete`.
- **Ponte clara:** tokens antigos (`--bg`, `--surface`, `--text`, `--brand`…) seguem o tema claro, para tela ainda
  não migrada não quebrar. Hex fixo em CSS não é coberto: é dívida da fase C.
- Mapas leem `data-theme` do `<html>` e trocam o estilo (MapLibre e mapa estático) ao mudar o tema.

### Tabela de tradução (antigo → semântico)

| Antigo | Semântico |
|---|---|
| `--bg` | `--color-bg-primary` |
| `--surface`, `--panel` | `--color-surface-default` |
| `--surface-2`, `--surface-field`, `--surface-chip`, `--panel-2` | `--color-surface-sunken` |
| `--line`, `--divider`, `--accent-line` | `--color-border-default` |
| `--text-strong`, `--text` | `--color-text-primary` |
| `--text-muted`, `--text-on-panel-muted` | `--color-text-secondary` |
| `--text-subtle` | `--color-text-muted` |
| `--brand` | `--color-action-primary` |
| `--brand-2` | `--color-text-brand` |
| `--accent-soft` | `--color-action-primary-subtle` |
| `--on-brand` | `--color-on-action` |
| `--success` / `--danger` / `--info` | `--color-success-text` / `--color-error-text` / `--color-info-text` |
| `--rating` | `--color-rating` |
| `--brand-grad`, `--panel-grad`, `--bg-radial` | cor sólida (`--color-action-primary`, `--color-surface-default`, `--color-bg-primary`) |
| `--brand-glow`, `--accent-glow`, `--shadow-brand` | `none` |
| `--shadow-float` / `--shadow-neutral` | `--elevation-2` / `--elevation-1` |
| `--scrim` | `--color-scrim` |
| `--r-sm` … `--r-pill` | `--radius-sm` … `--radius-pill` |
| `--dur-fast/base/slow` | `--motion-fast/base/slow` |
| `--fs-xs/sm/body/h3/h2/price` | `--text-caption/caption/meta/label/title/price-sm` |

## 2. Foundations

| Token | Valor | Uso |
|---|---|---|
| `--text-display` | 28/34 · 700 · Space Grotesk | — |
| `--text-title-lg` | 22/28 · 700 · Space Grotesk | título de tela |
| `--text-title` | 18/24 · 600 · Space Grotesk | seção |
| `--text-body-lg` / `--text-body` | 17/24 · 500 / **15/22 · 400** · Inter | corpo |
| `--text-label` | 14/20 · 600 · Inter | botão, rótulo |
| `--text-meta` | 13/18 · 400 · Inter | apoio |
| `--text-caption` | **12/16 · 500** · Inter | mínimo absoluto |
| `--text-price-lg` / `-price` / `-price-sm` | 28 / 17 / 15 · 700 · Space Grotesk | página, card, linha |

- **Raio:** `sm` 8 (botão pequeno, badge) · `md` 12 (botão, campo) · `lg` 16 (card, foto) · `xl` 20 (banner, sheet, só nos cantos de cima) · `pill`.
- **Borda:** 1px `--color-border-default`; campo usa `--color-border-input`; seleção 2px `--color-action-primary`.
- **Elevação:** só no que flutua. `--elevation-1` card arrastado, `-2` barra fixa e menu, `-3` sheet e modal.
- **Motion:** 120 / 200 / 320 ms; entrada `cubic-bezier(.2,.7,.2,1)`. Respeitar `prefers-reduced-motion`. Não animar hover de card.
- **Acessibilidade:** texto AA 4,5:1; UI 3:1; toque ≥ 44px (`--touch-min`); foco visível 2px (`--color-focus-ring`, offset 2px);
  estado nunca só por cor (ponto + texto; erro = ícone + texto); todo campo com `<label>`; `aria-live` em sacola e status.
- **Ícones:** Lucide, traço 1.75, tamanhos 16/20/24. Ícone sozinho exige `aria-label`.
- **Breakpoints:** `sm` < 600 · `md` 600–899 · `lg` ≥ 900 (Nav no topo, conteúdo até 1200px).

## 3. Princípios e regras (resumo)

1. **Clareza antes de decoração:** nenhum gradiente/glow sem função; uma cor de destaque por tela além do status.
2. **A próxima ação é óbvia:** um botão primário por tela, na zona do polegar no mobile.
3. **Menos passos no frequente:** recompra em ≤ 4 toques.
4. **Informação no momento certo:** card mostra o que decide abrir; produto, o que decide comprar.
5. **Preço e entrega nunca confusos:** prazo + frete no card, no produto e na sacola; total final é um número só.
6. **Feedback imediato:** resposta visual < 100 ms; adicionar mostra toast com "Ver sacola".
7. **Consistência > variedade:** componente novo só se nenhum existente resolve; cor só por token semântico.
8. **Mobile first** (360–390px), alvo mínimo 44px.
9. **Parecer rápido:** skeleton no lugar de spinner em listas, atualização otimista, nada de tela branca.
10. **Sem componente desnecessário:** a lista da seção 5 é a oficial.
11. **Não esconder ação importante:** ação primária nunca num menu "⋯"; cancelar pedido visível enquanto permitido.
12. **Vitrine limpa:** no máximo **1 Banner por tela**, 2 badges por card, sem "Novo/Popular" decorativo.

Regras citadas no spec: **D** roxo com hierarquia (só ação principal, item ativo, progresso, promoção e desconto; preço nunca roxo);
**E** pedido em andamento não domina a home; **I** espaçamento (gutter 16, entre seções 32, dentro de grupo 8–12).
Hierarquia visual completa: spec §6.1.

## 4. Matriz de estados

| Componente | default | hover | focus | pressed | disabled | loading | success | warning | error | empty |
|---|---|---|---|---|---|---|---|---|---|---|
| Button | sim | sim | sim | sim | sim | spinner + rótulo | — | — | — | — |
| Input / Select | sim | sim | sim | — | sim | — | sim | — | texto + ícone | placeholder |
| QuantitySelector | sim | sim | sim | sim | min/max | otimista | — | estoque baixo | sem estoque | — |
| ProductCard | sim | desktop | sim | sim | esgotado | skeleton | adicionado | últimas unidades | sem foto | — |
| DeliveryBadge | sim | — | — | — | — | "calculando…" | grátis/rápido | atraso | fora da área | sem endereço |
| Sacola | sim | — | — | — | — | skeleton | — | troca de loja | item indisponível | vazia |
| OrderTimeline | sim | — | — | — | — | — | entregue | atrasado | cancelado/problema | — |

Toda **tela** prevê: loading (skeleton), vazio, erro com "Tentar de novo", offline (faixa "Sem conexão"),
permissão negada (localização) e sem resultados (com sugestão).

## 5. Inventário de componentes

**`components/ui/` (primitivos, sem domínio):** Alert · Avatar · Badge · Button · Card · Checkbox · Chip · EmptyState ·
Icon · IconButton · Input · KpiBand · List · PriceTag · ProgressBar · QuantitySelector · RadioRow · Rating · SearchField ·
Section · Select · Sheet · Skeleton · StatusPill · Switch · Tabs · Tag · Toast.

Decisões que valem para o uso:

- **Button:** variantes `primary · secondary · tertiary · danger · onImage`. `accent` saiu e `ghost` virou `tertiary`.
  Altura `md` 48, `sm` 40. `primary` é a única ação principal da tela.
- **Sheet:** apresentação padrão `center` (confirmações e desktop). `presentation="bottom"` é **opt-in** (escolhas rápidas
  no mobile): renderiza em portal acima da TabBar, fecha com Esc e devolve o foco.
- **Toast:** aceita `action` (ex.: "Desfazer", "Ver sacola"). Tom por borda e ícone, nunca só cor.
- **EmptyState:** tem variante de **erro** com ação "Tentar de novo".
- **Card:** só quando a borda é funcional. N itens iguais viram `List`, não pilha de cards.

**`components/drop/` (domínio):** AppHeader · AddressBar · TabBar · CustomerAppChrome · Banner · CategoryRail · ProductCard ·
StoreCard · RepeatRow · StickyCart · DeliveryBadge · PriceDisplay · CartItem · OrderSummary · OrderRow · OrderTimeline ·
OrderTracker · OrderStatusBadge · Logo.

- **Banner:** **um por tela**, no máximo.
- **OrderStatusBadge:** status do cliente `awaiting_payment · awaiting_store · preparing · finding_courier · out_for_delivery ·
  in_progress · delivered · cancelled · problem`. `in_progress` é o honesto para "em andamento" quando o back não distingue a etapa.
  Status = ponto + rótulo, nunca só cor.
- **Mapas:** MapLibre e mapa estático escolhem o estilo pelo `data-theme` do `<html>` (claro/escuro) e remontam camadas na troca.

## 6. Guarda de regressão

`__tests__/dsV2Guard.test.ts` varre todo `.module.css` de `components/ui` e `components/drop` e falha com hex, token antigo
(incl. `--fs-*`) ou `gradient`/`glow` (regras em `__tests__/helpers/dsTokens.ts`).
`ALLOW` está **vazio** (fim da fase C) e o teste cobra isso. Páginas do cliente redesenhadas entram em `CLIENT_PAGE_CSS`.
`__tests__/clientRoutesGuard.test.ts` impede que telas e componentes do cliente naveguem para rota antiga.

## 7. Checklist de PR

- [ ] Só tokens semânticos (sem hex, sem primitiva, sem `--fs-*`, sem gradiente/glow).
- [ ] Um botão primário por tela; um Banner por tela.
- [ ] Toque ≥ 44px, foco visível, texto ≥ 12px, estado não depende só de cor.
- [ ] Testado nos dois temas (chave claro/escuro em `/_styleguide`).
- [ ] Estados cobertos: loading, vazio, erro com retentativa, offline, sem resultado.
- [ ] `prefers-reduced-motion` respeitado; nenhum hover animado em card.
- [ ] Componente novo? Justifique por que nenhum existente resolve (princípio 7/10).
- [ ] Tela migrada entrou em `LIGHT_ROUTES`; CSS da tela entrou em `CLIENT_PAGE_CSS`.
- [ ] `npx tsc --noEmit` e `npx jest` (no frontend) limpos; sem teste reescrito para "casar" com o código.

## 8. Telas do cliente (fase C)

### Rotas do cliente
- `lib/routes.ts` é a fonte das rotas (`ROUTES`, `pedidoHref`, `lojaHref`, `produtoHref`, `buscarHref`, `contaHref`). Nunca escreva o literal da rota no código do cliente.
- `lib/redirects.js` mantém as rotas antigas (`/stores`, `/store-order`, `/user-dashboard`, `/wallet`...) redirecionando com a query.
- Rotas compartilhadas com os painéis (`/user-profile`, `/editar-conta`) redirecionam só o cliente, via `useClienteRedirect`.
- `LIGHT_ROUTES` (`lib/routeTheme.ts`) lista as telas claras: toda tela migrada entra ali; o resto (painéis) segue escuro.

### Entrega na tela
- `deliveryStates` (`lib/deliveryView.ts`) traduz a cotação do servidor em `DeliveryBadge`.
- Os cards mostram estimativa; a Sacola mostra a rota real. Nunca prazo inventado: sem cotação ou com endereço `0,0`, não há prazo.

### Sacola
- Um único primário, com valor e método de pagamento.
- Os motivos de trava seguem uma ordem fixa e mostram só o primeiro.
- O Plano 1 vive na mesma tela ("A loja mesma entrega", sem taxa).

### Pedido
- `customerOrderStatus` e `orderTimelineSteps` (`lib/customerOrder.ts`) definem status e timeline.
- Hora real só onde ela existe; nunca hora estimada apresentada como fato.

### Sheets
- `bottom` para escolha; `center` para confirmação destrutiva.
- Trap de foco; Esc fecha só o sheet de cima.

## 9. Telas do cliente (fase C2)

### Topo de tela
- `ScreenHeader` (`components/drop/ScreenHeader.tsx`): voltar 44×44, título que corta com reticências, `end` (ação à direita) e `meta`.
- As telas listadas em `CUSTOMER_HEADERLESS_ROUTES` (`lib/routes.ts`) têm header próprio no mobile; a Nav global só aparece no desktop.

### Telas públicas claras
- Entrar, cadastro, esqueci a senha, termos, privacidade, cookies, 404, 500 e sem acesso são claras (`LIGHT_ROUTES`), mesmo sem papel.
- Entrar/cadastro/senha usam `AuthLayout` e `PasswordField` (o olho fica centrado no campo; o "confirmar senha" saiu).
- O `next` passa por `safeNext`/`authHref`: só caminho interno.

### Rotas compartilhadas
- `/notifications`, `/suporte`, `/verificacao`, `/verify-email`, `/upload` e `/foto-perfil` são páginas de todos os papéis. `useClienteRedirect`, `useLojistaRedirect` e `useMotoboyRedirect` levam cada papel à tela nova dele quando ela existe (cliente: /conta/*; lojista: /seller/*; motoboy: /motoboy/notificacoes); o admin fica na antiga (escura).
- Helpers que mudaram de destino: `ROUTES.notificacoes` (`/conta/notificacoes`), `ROUTES.ajuda` (`/conta/ajuda`), `ROUTES.privacidadeConta` (`/conta/privacidade`).
- Guardas: toda rota do cliente é clara (`clientRoutesTheme.test`), nenhuma tela navega para rota antiga (`clientRoutesGuard.test`) e todo CSS de página do cliente passa pela guarda de tokens (`dsV2Guard.test`).

### Depois da compra
- "Pedido confirmado" (`OrderConfirmed`) aparece uma vez, logo depois de um pagamento confirmado na sessão (`lib/justPaid`) e com `paymentStatus === 'paid'`.
- Cancelar mostra a prévia do servidor, buscada a cada abertura do sheet; o valor final é o gravado no cancelamento (`CancellationStatus`).
- Entregue: loja e entregador se avaliam num envio só (`DeliveredReview`).
- Estorno tem linha do tempo: custódia (`refundStatus`) e direto (`customerRefund`: devolvendo, conferindo, resolvendo, devolvido).

### Erros sem beco
- `ErrorScreen` sempre tem um botão primário e diz o que houve e o próximo passo; o secundário é opcional.
