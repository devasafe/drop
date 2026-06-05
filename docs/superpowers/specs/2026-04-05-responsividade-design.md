# Responsividade Completa — DROP

**Data:** 2026-04-05  
**Status:** Aprovado

---

## Visão Geral

Implementar responsividade completa para todos os ~50 arquivos CSS do projeto DROP (Next.js 13 / CSS Modules). O site deve funcionar perfeitamente em celular, tablet, notebook e desktop.

---

## Breakpoints

| Nome    | Faixa           | Uso                          |
|---------|-----------------|------------------------------|
| desktop | `> 1024px`      | Notebook/PC — estado atual   |
| tablet  | `640px–1024px`  | Tablet, notebook pequeno     |
| mobile  | `< 640px`       | Celular                      |

Convenção CSS:
```css
@media (max-width: 1024px) { /* tablet e abaixo */ }
@media (max-width: 640px)  { /* mobile */ }
```

---

## 1. Navegação (Nav)

**Componentes afetados:** `components/Nav.module.css`, `components/Nav.tsx`

### Desktop (> 1024px)
- Sem mudança. Logo + links centrais + área direita (carrinho, notif, menu do usuário).

### Tablet/Mobile (≤ 1024px)
- `centerLinks` oculto (`display: none`)
- `triggerName` oculto (só avatar + chevron)
- Botão ☰ aparece à direita, ao lado dos ícones de ação (carrinho, notif)
- Logo permanece à esquerda

### Menu Fullscreen Mobile
- Ao clicar ☰: overlay `position: fixed; inset: 0; z-index: 300` com fundo `#0A0A0A`
- Botão ✕ no canto superior direito
- Links grandes e espaçados (fácil de tocar com o polegar):
  - Produtos, Lojas
  - Seção "Conta": Perfil, Carteira, Pedidos/Painel (por role)
  - Seção "Painel Admin" (se admin): grid de links
  - Botão "Sair da conta" no rodapé
- Fecha ao navegar para qualquer link
- Estado controlado pelo `showMenu` já existente no Nav.tsx — adicionar classe CSS condicional

---

## 2. Grid de Produtos

**Componentes afetados:** `pages/Index.module.css`, `pages/Stores.module.css`, `pages/stores/StoreDetail.module.css`

| Breakpoint | Colunas | `minmax` |
|------------|---------|----------|
| Desktop    | auto-fill `minmax(260px, 1fr)` | — |
| Tablet     | `repeat(3, 1fr)` | — |
| Mobile     | `repeat(2, 1fr)` | — |

- Altura da imagem do card: desktop 200px → tablet 160px → mobile 130px
- Padding dos cards: reduz em mobile (12px → 8px)
- Título do produto: `font-size` reduz em mobile

---

## 3. Dashboards

**Componentes afetados:** `pages/StoreDashboard.module.css`, `pages/UserDashboard.module.css`  
**TSX afetados:** `pages/store-dashboard.tsx`, `pages/user-dashboard.tsx`

### Desktop (> 1024px)
- Sem mudança. `mainGrid`: sidebar 300px + área principal.

### Tablet/Mobile (≤ 1024px)
- `mainGrid` vira `grid-template-columns: 1fr` (uma coluna)
- **Sidebar** (storeCard/userCard): aparece como card colapsável no topo. Padrão: colapsado em mobile, expandido em tablet.
- **Navegação de seções**: renderização condicional baseada em largura de tela
  - Desktop: `tabsBar` existente com botões horizontais — sem mudança
  - Tablet/Mobile: `<select>` nativo estilizado com CSS (fundo `#1A1A1A`, borda roxa, `width: 100%`). Mesmo estado `activeTab`, só muda o elemento de controle.
  - Opções do select: Métricas, Pedidos, Histórico, Devoluções, Chat (conforme cada dashboard)
- **Conteúdo**: ocupa 100% da largura disponível
- **Métricas**: grid de cards KPI vira 2 colunas em tablet e mobile (ao invés de 4)
- **Tabelas de pedidos**: scroll horizontal em mobile (`overflow-x: auto`)
- **Modais**: `max-height: 95vh`, scroll interno, border-radius menor

---

## 4. Páginas de Autenticação e Formulários Simples

**Componentes afetados:** `Login.module.css`, `Register.module.css`, `BankSetup.module.css`, `UserProfile.module.css`, `AvaliarMotoboy.module.css`

- Container: `max-width` mantido, mas `width: 100%` + `padding: 0 16px` em mobile
- Títulos: reduzem ~20% em mobile
- Campos de formulário: `width: 100%` sempre
- Botões: `width: 100%` em mobile

---

## 5. Fluxo de Compra

**Componentes afetados:** `Checkout.module.css`, `CheckoutVitrine.module.css`, `OrderDetail.module.css`

- Layouts de 2 colunas (produto + resumo do pedido) viram 1 coluna em mobile — resumo vai para baixo do conteúdo principal
- Imagens de produto: `width: 100%`, altura automática
- Botões de ação (Confirmar pedido, Pagar): `width: 100%` em mobile
- `OrderDetail.module.css`: timeline e detalhes empilham verticalmente

---

## 6. Página de Produto

**Componentes afetados:** `pages/product/ProductDetail.module.css`

- Layout desktop: imagem à esquerda + info à direita → em mobile: imagem no topo, info abaixo (1 coluna)
- Galeria de imagens: scroll horizontal em mobile
- Botão "Adicionar ao carrinho": fixo no rodapé em mobile (`position: sticky; bottom: 0`)

---

## 7. Páginas de Loja

**Componentes afetados:** `pages/stores/StoreDetail.module.css`, `pages/Stores.module.css`

- Header da loja (banner + info): empilha verticalmente em mobile
- Grid de produtos da loja: segue o mesmo padrão da seção 2 (2/3 colunas)

---

## 8. Páginas do Seller

**Componentes afetados:** `seller/CreateStore.module.css`, `seller/ProductForm.module.css`, `seller/SelectPlan.module.css`, `seller/SellerProducts.module.css`, `seller/SellerOrder.module.css`, `seller/SellerWallet.module.css`, `seller/TransferWallet.module.css`

- Formulários: 1 coluna em mobile
- `SelectPlan`: cards de plano viram lista vertical em mobile
- `SellerProducts`: tabela vira cards empilhados em mobile
- `SellerOrder`: detalhes do pedido empilham verticalmente

---

## 9. Páginas do Motoboy

**Componentes afetados:** todos os `motoboy/*.module.css`

- Painéis de estatísticas: 2 colunas em mobile
- Mapas (MotoboyRouteMap): `width: 100%; height: 300px` em mobile
- Listas de entregas: cards full-width

---

## 10. Páginas Admin

**Componentes afetados:** todos os `admin/*.module.css`

- Tabelas: `overflow-x: auto` com scroll horizontal (não quebrar layout)
- Filtros e painéis laterais: colapsam em botão em mobile
- Grids de cards (AdminDashboard): 2→1 coluna em mobile
- `AdminPricingConfig`, `AdminSettings`: formulários 1 coluna

---

## 11. Componentes Compartilhados

**Componentes afetados:** `Footer.module.css`, `BannerCarousel.module.css`, `ChatWidget.tsx`, `Notifications.module.css`, `Suporte.module.css`, `MyWallet.module.css`

- **Footer**: colunas de links viram 2 colunas em tablet, 1 coluna em mobile
- **BannerCarousel**: altura reduz em mobile; dots de navegação maiores (mais fáceis de tocar)
- **ChatWidget**: botão flutuante mantém `bottom: 16px; right: 16px`. Em mobile, reduz de 56px para 48px de diâmetro para não sobrepor conteúdo desnecessariamente.
- **Notifications**: lista full-width em mobile
- **Suporte**: formulário 1 coluna em mobile
- **MyWallet**: cards de saldo empilham em mobile

---

## 12. Páginas Motoboy Especiais

**Componentes afetados:** `MotoboyGamification.module.css`, `MotoboyRanking.module.css`, `MotoboyBeneficios.module.css`

- Leaderboard / ranking: lista full-width, avatar menor
- Benefícios: cards em 1 coluna em mobile
- Gamificação: medidores e gráficos redimensionam proporcionalmente

---

## Ordem de Implementação

Por impacto e complexidade:

1. **globals.css** — adicionar variáveis de breakpoint e utilitários base
2. **Nav** — maior impacto visual, aparece em todas as páginas
3. **Index + Stores** — páginas de entrada do usuário
4. **ProductDetail + StoreDetail** — fluxo principal de compra
5. **Checkout + OrderDetail** — fluxo de conversão
6. **StoreDashboard + UserDashboard** — dashboards (mais complexos)
7. **Seller pages** — painel do lojista
8. **Motoboy pages** — painel do entregador
9. **Admin pages** — painel administrativo
10. **Login + Register + formulários simples** — mais simples
11. **Componentes compartilhados** — Footer, BannerCarousel, etc.

---

## Notas Técnicas

- **CSS Modules**: cada arquivo `.module.css` recebe seus próprios `@media`. Sem criar novos arquivos.
- **Nav.tsx**: adicionar estado `menuOpen` + classe condicional para o overlay fullscreen. Bloquear scroll do body quando menu aberto (`document.body.style.overflow`).
- **Dashboard TSX**: o select de seção em mobile é uma alternativa de renderização condicional do `tabsBar` existente — mesma lógica de `activeTab`, apresentação diferente via CSS + possível condicional de renderização.
- **Sem mudanças de lógica de negócio** — apenas CSS e pequenas adaptações de renderização nos dashboards.
- **Touch targets**: botões e links em mobile com mínimo de 44px de altura (acessibilidade).
