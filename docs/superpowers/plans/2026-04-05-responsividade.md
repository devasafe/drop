# Responsividade Completa DROP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar responsividade completa a todos os ~50 arquivos CSS do DROP, tornando o site perfeito em celular, tablet e desktop.

**Architecture:** Cada arquivo `.module.css` recebe seus próprios blocos `@media` no final do arquivo. O Nav.tsx ganha um menu fullscreen mobile controlado por novo estado `mobileMenuOpen`. Os dashboards usam renderização dupla (CSS show/hide) para tabs vs select sem afetar SSR.

**Tech Stack:** CSS Modules, Next.js 13 Pages Router, React 18, TypeScript

**Breakpoints:**
- Tablet/baixo: `@media (max-width: 1024px)`
- Mobile: `@media (max-width: 640px)`

---

## Task 1: globals.css — Utilitários base de responsividade

**Files:**
- Modify: `frontend/styles/globals.css`

- [ ] **Step 1: Adicionar utilitários mobile ao final do globals.css**

Abrir `frontend/styles/globals.css` e adicionar ao final:

```css
/* ── Responsive Utilities ──────────────────────────────── */
@media (max-width: 1024px) {
  .hide-tablet { display: none !important; }
}

@media (max-width: 640px) {
  .hide-mobile { display: none !important; }

  body {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }
}
```

- [ ] **Step 2: Verificar**

Abrir o projeto no browser (`npm run dev`), redimensionar para 375px. Confirmar que não há scroll horizontal na página.

- [ ] **Step 3: Commit**

```bash
cd /d/PROJETOS/Drop/frontend
git add styles/globals.css
git commit -m "style: add responsive utility classes to globals"
```

---

## Task 2: Nav — Hamburger menu fullscreen mobile

**Files:**
- Modify: `frontend/components/Nav.tsx`
- Modify: `frontend/components/Nav.module.css`

- [ ] **Step 1: Adicionar estado e lógica do menu mobile no Nav.tsx**

No `Nav.tsx`, adicionar o estado `mobileMenuOpen` e a lógica de lock de scroll. Localizar a linha `const [showMenu, setShowMenu] = useState(false);` (linha ~77) e adicionar logo abaixo:

```tsx
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

// Lock body scroll quando menu mobile aberto
useEffect(() => {
  document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
  return () => { document.body.style.overflow = ''; };
}, [mobileMenuOpen]);
```

- [ ] **Step 2: Adicionar botão hamburger no JSX do Nav**

Localizar a div `<div className={styles.right}>` no return do Nav. Adicionar o botão ☰ como primeiro filho:

```tsx
<div className={styles.right}>
  {/* Botão hamburger — só aparece em tablet/mobile */}
  <button
    className={styles.hamburger}
    onClick={() => setMobileMenuOpen(true)}
    aria-label="Abrir menu"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  </button>
  {/* ... resto do conteúdo existente ... */}
```

- [ ] **Step 3: Adicionar overlay fullscreen mobile no JSX do Nav**

Adicionar o overlay logo antes do `</header>` de fechamento:

```tsx
  {/* Menu fullscreen mobile */}
  {mobileMenuOpen && (
    <div className={styles.mobileOverlay}>
      <div className={styles.mobileOverlayHeader}>
        <Link href="/inicio" className={styles.logo} onClick={() => setMobileMenuOpen(false)}>
          <img src="/images/logog_png.png" alt="DROP" />
        </Link>
        <button className={styles.mobileClose} onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <nav className={styles.mobileNav}>
        <Link href="/" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>🏠 Produtos</Link>
        <Link href="/stores" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>🏪 Lojas</Link>
        {isAdmin && (
          <Link href="/admin/dashboard" className={`${styles.mobileNavLink} ${styles.mobileNavLinkAdmin}`} onClick={() => setMobileMenuOpen(false)}>
            {meta.emoji} Painel Admin
          </Link>
        )}
      </nav>

      {user ? (
        <>
          <div className={styles.mobileSectionLabel}>Conta</div>
          <nav className={styles.mobileNav}>
            <a href="/user-profile" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>👤 Meu Perfil</a>
            <a href="/my-wallet" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>💰 Minha Carteira</a>
            {activeRole === 'cliente' && (
              <a href="/user-dashboard" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>📦 Meus Pedidos</a>
            )}
            {activeRole === 'lojista' && (
              hasStore ? (
                <>
                  <a href="/seller/dashboard" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>🏪 Meu Painel</a>
                  <a href="/seller/create-product" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>➕ Novo Produto</a>
                </>
              ) : (
                <a href="/seller/create-store" className={`${styles.mobileNavLink} ${styles.mobileNavLinkPurple}`} onClick={() => setMobileMenuOpen(false)}>🏪 Criar Loja</a>
              )
            )}
            {activeRole === 'motoboy' && (
              <a href="/motoboy" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>🏍️ Meu Painel</a>
            )}
            <a href="/suporte" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}>🎧 Suporte</a>
          </nav>
          <div className={styles.mobileFoot}>
            <button onClick={() => { setMobileMenuOpen(false); logout?.(); }} className={styles.mobileLogout}>
              Sair da conta
            </button>
          </div>
        </>
      ) : (
        <div className={styles.mobileFoot}>
          <Link href="/login" className={styles.mobileLoginBtn} onClick={() => setMobileMenuOpen(false)}>Entrar</Link>
          <Link href="/register" className={styles.mobileRegisterBtn} onClick={() => setMobileMenuOpen(false)}>Cadastrar</Link>
        </div>
      )}
    </div>
  )}
</header>
```

- [ ] **Step 4: Adicionar CSS do menu mobile no Nav.module.css**

Adicionar ao final do `frontend/components/Nav.module.css`:

```css
/* ── Hamburger button ──────────────────────────────────── */
.hamburger {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.7);
  padding: 8px;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
}
.hamburger:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

/* ── Mobile fullscreen overlay ─────────────────────────── */
.mobileOverlay {
  display: none;
}

/* ── Tablet / Mobile ───────────────────────────────────── */
@media (max-width: 1024px) {
  .centerLinks {
    display: none;
  }
  .triggerName {
    display: none;
  }
  .hamburger {
    display: flex;
  }

  .mobileOverlay {
    display: flex;
    flex-direction: column;
    position: fixed;
    inset: 0;
    z-index: 300;
    background: #0A0A0A;
    overflow-y: auto;
    padding-bottom: 32px;
  }

  .mobileOverlayHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    height: 60px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }

  .mobileClose {
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.5);
    padding: 8px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }
  .mobileClose:hover { color: #fff; }

  .mobileNav {
    display: flex;
    flex-direction: column;
    padding: 8px 12px;
  }

  .mobileNavLink {
    color: rgba(255, 255, 255, 0.85);
    text-decoration: none;
    font-size: 18px;
    font-weight: 600;
    padding: 14px 12px;
    border-radius: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: background 0.15s, color 0.15s;
    font-family: var(--drop-font-display);
  }
  .mobileNavLink:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
  }

  .mobileNavLinkAdmin {
    color: #A78BFA;
  }

  .mobileNavLinkPurple {
    color: #8B5CF6;
  }

  .mobileSectionLabel {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.28);
    padding: 16px 24px 4px;
  }

  .mobileFoot {
    margin-top: auto;
    padding: 24px 20px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mobileLogout {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.5);
    border-radius: 10px;
    padding: 12px;
    font-size: 15px;
    cursor: pointer;
    font-family: var(--drop-font-body);
    transition: background 0.15s;
  }
  .mobileLogout:hover { background: rgba(255, 255, 255, 0.05); }

  .mobileLoginBtn {
    display: block;
    text-align: center;
    text-decoration: none;
    color: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 13px;
    font-size: 16px;
    font-weight: 500;
  }

  .mobileRegisterBtn {
    display: block;
    text-align: center;
    text-decoration: none;
    background: #6C2BD9;
    color: #fff;
    border-radius: 10px;
    padding: 13px;
    font-size: 16px;
    font-weight: 600;
  }
}
```

- [ ] **Step 5: Verificar**

Abrir o browser em 375px. Confirmar: links centrais somem, botão ☰ aparece, clicar abre overlay fullscreen com todos os links, clicar ✕ fecha.

- [ ] **Step 6: Commit**

```bash
git add components/Nav.tsx components/Nav.module.css
git commit -m "feat: add fullscreen mobile menu to Nav"
```

---

## Task 3: Index — Grid de produtos responsivo

**Files:**
- Modify: `frontend/pages/Index.module.css`

- [ ] **Step 1: Adicionar media queries ao final do Index.module.css**

O arquivo já tem `@media (max-width: 640px)` com algumas regras parciais na linha ~417. Localizar esse bloco e substituir por versão completa, além de adicionar tablet:

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .title { font-size: 32px; }
  .subtitle { font-size: 16px; }
  .grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .imageBox { height: 170px; }
  .filtersBar { padding: 20px 16px; gap: 10px; }
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .title { font-size: 24px; }
  .subtitle { font-size: 14px; }
  .filtersBar { padding: 16px; gap: 8px; flex-wrap: wrap; }
  .grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .imageBox { height: 130px; }
  .cardBody { padding: 10px; }
  .productName { font-size: 13px; }
  .addBtn { font-size: 12px; padding: 7px 10px; }
}
```

(Remover o bloco `@media (max-width: 640px)` antigo que estava no arquivo antes de adicionar estes.)

- [ ] **Step 2: Verificar**

Testar em 375px (2 colunas) e 768px (3 colunas). Confirmar que cards não transbordam.

- [ ] **Step 3: Commit**

```bash
git add pages/Index.module.css
git commit -m "style(index): responsive product grid — 2col mobile, 3col tablet"
```

---

## Task 4: Stores — Listagem de lojas responsiva

**Files:**
- Modify: `frontend/pages/Stores.module.css`

- [ ] **Step 1: Adicionar media queries ao final do Stores.module.css**

Os seletores existentes são: `.grid`, `.title`, `.toolbar`, `.input`, `.header`. Adicionar ao final:

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .title { font-size: 28px; }
  .toolbar { flex-wrap: wrap; gap: 10px; }
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .title { font-size: 22px; }
  .toolbar { flex-direction: column; }
  .input { width: 100%; font-size: 16px; }
}
```

- [ ] **Step 2: Verificar**

Abrir `/stores` em 375px e 768px. Confirmar grid adaptado.

- [ ] **Step 3: Commit**

```bash
git add pages/Stores.module.css
git commit -m "style(stores): responsive store listing grid"
```

---

## Task 5: StoreDetail — Página de detalhe da loja

**Files:**
- Modify: `frontend/pages/stores/StoreDetail.module.css`

- [ ] **Step 1: Adicionar media queries ao final do StoreDetail.module.css**

O arquivo tem `.heroRow` (row com info da loja), `.coverBanner`, e grid de produtos. Localizar os seletores e adicionar ao final:

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .heroRow { gap: 16px; }
  .storeIcon { width: 80px; height: 80px; }
  .storeTitle { font-size: 22px; }
  .grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .coverBanner { height: 140px; }
  .hero { padding: 16px; }
  .heroRow { flex-direction: column; align-items: flex-start; gap: 12px; }
  .storeIcon { width: 64px; height: 64px; }
  .storeTitle { font-size: 20px; }
  .storeDesc { font-size: 13px; }
  .grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .imageBox { height: 130px; }
  .filtersRow { flex-direction: column; gap: 8px; }
}
```

- [ ] **Step 2: Verificar**

Abrir uma página de loja em 375px. Banner, foto e info da loja devem empilhar bem.

- [ ] **Step 3: Commit**

```bash
git add pages/stores/StoreDetail.module.css
git commit -m "style(store-detail): responsive hero and product grid"
```

---

## Task 6: ProductDetail — Página de produto

**Files:**
- Modify: `frontend/pages/product/ProductDetail.module.css`

- [ ] **Step 1: Adicionar media queries ao final do ProductDetail.module.css**

O layout usa `.mainGrid` com `imageBox` à esquerda e `infoBox` à direita. O arquivo já tem `@media` — substituir/complementar:

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .mainGrid { gap: 20px; }
  .imageBox { min-width: 280px; }
  .productTitle { font-size: 22px; }
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .container { padding: 0 0 80px; }
  .mainCard { border-radius: 0; border-left: none; border-right: none; }
  .mainGrid {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .imageBox {
    width: 100%;
    height: 280px;
    min-width: unset;
    border-radius: 0;
  }
  .productImage { border-radius: 0; }
  .infoBox { padding: 16px; }
  .productTitle { font-size: 20px; }
  .priceBlock { flex-wrap: wrap; gap: 8px; }
  .addToCartBtn {
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    border-radius: 0;
    z-index: 50;
    padding: 16px;
    font-size: 16px;
  }
  .breadcrumb { padding: 12px 16px; }
}
```

- [ ] **Step 2: Verificar**

Abrir um produto em 375px. Imagem no topo, info abaixo. Botão "Adicionar ao carrinho" fixo no rodapé.

- [ ] **Step 3: Commit**

```bash
git add pages/product/ProductDetail.module.css
git commit -m "style(product-detail): responsive layout with sticky cart button on mobile"
```

---

## Task 7: Checkout — Fluxo de compra responsivo

**Files:**
- Modify: `frontend/pages/Checkout.module.css`

- [ ] **Step 1: Adicionar media queries ao final do Checkout.module.css**

O layout tem `.mainGrid` com `grid-template-columns: 1fr 380px` e `.fieldGrid2` com 2 colunas. O arquivo já tem `@media` — adicionar/substituir:

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .mainGrid { grid-template-columns: 1fr 320px; gap: 16px; }
  .container { padding: 20px 16px; }
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .container { padding: 16px; }
  .mainGrid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .rightColumn { order: -1; } /* Resumo do pedido vai para cima */
  .fieldGrid2 { grid-template-columns: 1fr; }
  .paymentOptions { flex-direction: column; }
  .pageTitle { font-size: 22px; }
  .sectionTitle { font-size: 15px; }
}
```

- [ ] **Step 2: Verificar**

Abrir `/checkout` em 375px. Resumo do pedido aparece acima, formulário de pagamento abaixo. Campos de endereço em coluna única.

- [ ] **Step 3: Commit**

```bash
git add pages/Checkout.module.css
git commit -m "style(checkout): responsive two-column to single-column layout"
```

---

## Task 8: CheckoutVitrine — Checkout da vitrine responsivo

**Files:**
- Modify: `frontend/pages/CheckoutVitrine.module.css`

- [ ] **Step 1: Adicionar media queries ao final do CheckoutVitrine.module.css**

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .mainGrid { gap: 16px; }
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .container { padding: 16px; }
  .mainGrid { grid-template-columns: 1fr; }
  .pageTitle { font-size: 22px; }
  .fieldGrid2 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Commit**

```bash
git add pages/CheckoutVitrine.module.css
git commit -m "style(checkout-vitrine): responsive layout"
```

---

## Task 9: OrderDetail — Detalhe do pedido responsivo

**Files:**
- Modify: `frontend/pages/OrderDetail.module.css`

- [ ] **Step 1: Adicionar media queries ao final do OrderDetail.module.css**

O layout tem `.page` com flex-row contendo `.leftPanel` e `.rightPanel` (chat). Em mobile empilham:

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .page { gap: 16px; }
  .leftPanel { min-width: unset; }
  .rightPanel { min-width: unset; }
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .page {
    flex-direction: column;
    padding: 0;
  }
  .leftPanel {
    border-right: none;
    border-bottom: 1px solid var(--drop-border);
    padding: 16px;
    flex: unset;
  }
  .rightPanel {
    flex: unset;
    height: 400px;
    padding: 0;
  }
  .pageTitle { font-size: 20px; }
  .infoCard { padding: 12px; }
}
```

- [ ] **Step 2: Verificar**

Abrir um pedido em 375px. Detalhes do pedido acima, chat abaixo.

- [ ] **Step 3: Commit**

```bash
git add pages/OrderDetail.module.css
git commit -m "style(order-detail): responsive layout stacks panels on mobile"
```

---

## Task 10: UserDashboard — Dashboard do cliente responsivo

**Files:**
- Modify: `frontend/pages/UserDashboard.module.css`
- Modify: `frontend/pages/user-dashboard.tsx`

- [ ] **Step 1: Adicionar media queries ao UserDashboard.module.css**

O layout tem `.mainGrid` com sidebar (`.sidebar`) e `.mainContent`. As tabs ficam em `.tabs`.

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .mainGrid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .sidebar {
    position: static;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16px;
    padding: 16px;
  }
  .avatarSection { flex-direction: row; align-items: center; gap: 12px; margin-bottom: 0; }
  .avatarImg, .avatarInitials { width: 56px; height: 56px; font-size: 20px; }
  .sidebarInfo { display: none; } /* colapsado em tablet */
  .sidebarActions { flex-direction: row; margin-top: 0; }
  .pageTitle { font-size: 26px; }
  .tabs { display: none; } /* esconde tabs desktop */
  .tabsMobile { display: flex; } /* mostra select mobile */
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .sidebar { flex-direction: column; align-items: flex-start; gap: 12px; }
  .sidebarActions { width: 100%; }
  .btnEdit, .btnDanger { flex: 1; justify-content: center; }
  .orderCard { padding: 12px; }
}

/* ── Select de tabs mobile ─────────────────────────────── */
.tabsMobile {
  display: none; /* esconde no desktop */
  width: 100%;
  background: var(--drop-surface);
  border: 1px solid rgba(108, 43, 217, 0.4);
  border-radius: 10px;
  padding: 10px 14px;
  color: var(--drop-white);
  font-size: 15px;
  font-family: var(--drop-font-body);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236C2BD9' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  margin-bottom: 16px;
}
```

- [ ] **Step 2: Adicionar select mobile no user-dashboard.tsx**

Localizar o bloco `<div className={styles.tabs}>` no return (linha ~197). Logo acima dele, adicionar o select mobile:

```tsx
{/* Select de seção — visível apenas em tablet/mobile via CSS */}
<select
  className={styles.tabsMobile}
  value={activeTab}
  onChange={e => setActiveTab(e.target.value)}
>
  <option value="pending">Em Andamento ({pendingOrders.length})</option>
  <option value="addresses">Endereços ({addresses.length})</option>
  <option value="history">Histórico ({completedOrders.length})</option>
</select>
```

- [ ] **Step 3: Verificar**

Abrir `/user-dashboard` em 375px. Sidebar vira card compacto no topo. Select dropdown aparece no lugar das tabs. Conteúdo ocupa 100%.

- [ ] **Step 4: Commit**

```bash
git add pages/UserDashboard.module.css pages/user-dashboard.tsx
git commit -m "feat(user-dashboard): responsive layout with mobile section select"
```

---

## Task 11: StoreDashboard — Dashboard do lojista responsivo

**Files:**
- Modify: `frontend/pages/StoreDashboard.module.css`
- Modify: `frontend/pages/store-dashboard.tsx`

- [ ] **Step 1: Adicionar media queries ao StoreDashboard.module.css**

```css
/* ── Tablet ────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .mainGrid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .storeCard {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .storeCardTitle { width: 100%; margin-bottom: 0; }
  .tabsBar { display: none; } /* esconde tabs desktop */
  .tabsMobile { display: flex; } /* mostra select mobile */
  .metricsGrid { grid-template-columns: repeat(2, 1fr); }
  .financialGrid5 { grid-template-columns: repeat(2, 1fr); }
  .infoGrid2 { grid-template-columns: 1fr; }
}

/* ── Mobile ─────────────────────────────────────────────── */
@media (max-width: 640px) {
  .container { padding: 16px; }
  .storeCard { padding: 14px; }
  .metricsGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .metricCard { padding: 14px; }
  .orderCard { padding: 12px; }
  .orderCardTop { flex-wrap: wrap; gap: 8px; }
  .modal { padding: 12px; }
  .modalDialog { max-width: 100%; border-radius: 12px; }
  .mapCard { height: 220px; }
  .chatTabGrid { grid-template-columns: 1fr; }
}

/* ── Select de tabs mobile ─────────────────────────────── */
.tabsMobile {
  display: none;
  width: 100%;
  background: var(--drop-surface);
  border: 1px solid rgba(108, 43, 217, 0.4);
  border-radius: 10px;
  padding: 10px 14px;
  color: var(--drop-white);
  font-size: 15px;
  font-family: var(--drop-font-body);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236C2BD9' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  margin-bottom: 16px;
}
```

- [ ] **Step 2: Adicionar select mobile no store-dashboard.tsx**

Localizar `<div className={styles.tabsBar}>` (linha ~1454). Logo acima, adicionar:

```tsx
{/* Select de seção — visível apenas em tablet/mobile via CSS */}
<select
  className={styles.tabsMobile}
  value={activeTab}
  onChange={e => setActiveTab(e.target.value)}
>
  <option value="metrics">📊 Métricas</option>
  <option value="orders">🚚 Pedidos ({orders.length})</option>
  <option value="history">📜 Histórico ({historyOrders.length})</option>
  <option value="returns">📦 Devoluções ({returnRequests.length})</option>
  <option value="chat">💬 Chat Pré-Compra</option>
</select>
```

- [ ] **Step 3: Verificar**

Abrir `/store-dashboard` em 375px. Sidebar da loja fica compacta no topo. Select dropdown substitui as tabs. Métricas em 2 colunas.

- [ ] **Step 4: Commit**

```bash
git add pages/StoreDashboard.module.css pages/store-dashboard.tsx
git commit -m "feat(store-dashboard): responsive layout with mobile section select"
```

---

## Task 12: Login, Register e formulários simples

**Files:**
- Modify: `frontend/pages/Login.module.css`
- Modify: `frontend/pages/Register.module.css`
- Modify: `frontend/pages/BankSetup.module.css`
- Modify: `frontend/pages/UserProfile.module.css`
- Modify: `frontend/pages/AvaliarMotoboy.module.css`

- [ ] **Step 1: Login.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .page { padding: 16px; align-items: flex-start; padding-top: 32px; }
  .card { padding: 24px 20px; width: 100%; }
  .logoimg { height: 32px; }
  .input { font-size: 16px; } /* evita zoom no iOS */
  .submitBtn { font-size: 15px; padding: 13px; }
}
```

- [ ] **Step 2: Register.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 24px 20px; }
  .fieldGrid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .card { padding: 24px 16px; }
  .pageTitle { font-size: 22px; }
  .input { font-size: 16px; }
  .submitBtn { font-size: 15px; }
  .roleGrid { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 3: BankSetup.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .card { padding: 20px 16px; }
  .pageTitle { font-size: 22px; }
  .fieldGrid2 { grid-template-columns: 1fr; }
  .input { font-size: 16px; }
}
```

- [ ] **Step 4: UserProfile.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .fieldGrid2 { grid-template-columns: 1fr; }
  .avatarSection { flex-direction: column; align-items: center; text-align: center; }
  .input { font-size: 16px; }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 5: AvaliarMotoboy.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .card { padding: 20px 16px; }
  .pageTitle { font-size: 22px; }
  .stars { gap: 8px; }
  .starBtn { font-size: 32px; }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 6: Verificar**

Testar Login e Register em 375px. Campos não devem dar zoom no iOS (font-size: 16px). Layout centrado com padding adequado.

- [ ] **Step 7: Commit**

```bash
git add pages/Login.module.css pages/Register.module.css pages/BankSetup.module.css pages/UserProfile.module.css pages/AvaliarMotoboy.module.css
git commit -m "style(auth-forms): responsive layout for login, register and simple forms"
```

---

## Task 13: Notificações, Suporte, MyWallet

**Files:**
- Modify: `frontend/pages/Notifications.module.css`
- Modify: `frontend/pages/Suporte.module.css`
- Modify: `frontend/pages/MyWallet.module.css`

- [ ] **Step 1: Notifications.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .notificationItem { padding: 12px 14px; gap: 10px; }
  .notificationIcon { font-size: 20px; }
}
```

- [ ] **Step 2: Suporte.module.css — adicionar/substituir `@media` existente**

O arquivo tem `.bodyWrapper { grid-template-columns: 340px 1fr }` e já tem 1 `@media` que colapsa para 1 coluna. Substituir o `@media` existente por versão completa:

```css
@media (max-width: 1024px) {
  .bodyWrapper { grid-template-columns: 280px 1fr; gap: 16px; }
  .page { padding: 0 16px; }
}

@media (max-width: 640px) {
  .page { padding: 0 12px; }
  .bodyWrapper { grid-template-columns: 1fr; }
  .sidebar { max-height: 320px; overflow-y: auto; }
  .topbarTitle { font-size: 16px; }
  .form { padding: 14px; }
  .btnSubmit { width: 100%; }
}
```

- [ ] **Step 3: MyWallet.module.css — adicionar/substituir `@media` existente**

O arquivo já tem 1 `@media` — substituir por versão completa:

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); }
  .statsGrid5 { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .balanceCard { padding: 20px; }
  .balanceAmount { font-size: 32px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .statsGrid5 { grid-template-columns: repeat(2, 1fr); }
  .transactionItem { padding: 12px; flex-wrap: wrap; gap: 6px; }
  .bankWarningBtn { width: 100%; text-align: center; }
}
```

- [ ] **Step 4: Commit**

```bash
git add pages/Notifications.module.css pages/Suporte.module.css pages/MyWallet.module.css
git commit -m "style(misc-pages): responsive notifications, support and wallet"
```

---

## Task 14: Páginas do Seller

**Files:**
- Modify: `frontend/pages/seller/CreateStore.module.css`
- Modify: `frontend/pages/seller/ProductForm.module.css`
- Modify: `frontend/pages/seller/SelectPlan.module.css`
- Modify: `frontend/pages/seller/SellerProducts.module.css`
- Modify: `frontend/pages/seller/SellerOrder.module.css`
- Modify: `frontend/pages/seller/SellerWallet.module.css`
- Modify: `frontend/pages/seller/TransferWallet.module.css`

- [ ] **Step 1: CreateStore.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 24px 20px; }
  .formGrid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .fieldGrid2 { grid-template-columns: 1fr; }
  .input { font-size: 16px; }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 2: ProductForm.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 24px 20px; }
  .mainGrid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .fieldGrid2 { grid-template-columns: 1fr; }
  .input { font-size: 16px; }
  .imageUploadArea { height: 180px; }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 3: SelectPlan.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .plansGrid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .plansGrid { grid-template-columns: 1fr; gap: 12px; }
  .planCard { padding: 20px; }
}
```

- [ ] **Step 4: SellerProducts.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .productsList { gap: 12px; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .pageHeader { flex-direction: column; align-items: flex-start; gap: 12px; }
  .btnPrimary { width: 100%; text-align: center; }
  .productCard { flex-direction: column; gap: 12px; }
  .productThumb { width: 100%; height: 160px; }
  .productActions { flex-direction: row; gap: 8px; }
}
```

- [ ] **Step 5: SellerOrder.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .orderGrid { grid-template-columns: 1fr; }
  .customerCard, .itemsCard, .mapCard { padding: 14px; }
  .mapCard { height: 220px; }
  .actionBtns { flex-direction: column; }
  .actionBtn { width: 100%; }
}
```

- [ ] **Step 6: SellerWallet.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .balanceCard { padding: 20px; }
  .balanceAmount { font-size: 30px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .transactionItem { flex-wrap: wrap; gap: 6px; }
  .actionBtn { width: 100%; }
}
```

- [ ] **Step 7: TransferWallet.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .card { padding: 20px 16px; }
  .pageTitle { font-size: 22px; }
  .input { font-size: 16px; }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 8: Verificar**

Testar `/seller/create-store`, `/seller/select-plan` e `/seller/products` em 375px. Planos em 1 coluna, formulários em coluna única, cards de produtos empilhados.

- [ ] **Step 9: Commit**

```bash
git add pages/seller/
git commit -m "style(seller): responsive layouts for all seller pages"
```

---

## Task 15: Páginas do Motoboy

**Files:**
- Modify: `frontend/pages/motoboy/MotoboyIndex.module.css`
- Modify: `frontend/pages/motoboy/MotoboyProfile.module.css`
- Modify: `frontend/pages/motoboy/MotoboyHistory.module.css`
- Modify: `frontend/pages/motoboy/MotoboyOngoing.module.css`
- Modify: `frontend/pages/motoboy/MotoboyWallet.module.css`
- Modify: `frontend/pages/motoboy/MotoboyRanking.module.css`
- Modify: `frontend/pages/motoboy/MotoboyGamification.module.css`
- Modify: `frontend/pages/motoboy/MotoboyBeneficios.module.css`
- Modify: `frontend/pages/motoboy/MotoboyPublicProfile.module.css`
- Modify: `frontend/pages/motoboy/MotoboyRequestWithdrawal.module.css`
- Modify: `frontend/pages/motoboy/MotoboyTransferWallet.module.css`

- [ ] **Step 1: MotoboyIndex.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .statCard { padding: 14px; }
  .nav { overflow-x: auto; gap: 4px; }
  .navLink { white-space: nowrap; font-size: 13px; padding: 6px 10px; }
  .deliveriesSection { padding: 16px 0; }
}
```

- [ ] **Step 2: MotoboyProfile.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .profileCard { padding: 20px 16px; }
  .avatarSection { flex-direction: column; align-items: center; text-align: center; }
  .fieldGrid2 { grid-template-columns: 1fr; }
  .input { font-size: 16px; }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 3: MotoboyHistory.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .filtersRow { flex-direction: column; gap: 8px; }
  .filterInput { width: 100%; }
  .deliveryCard { padding: 12px; }
  .deliveryCardTop { flex-wrap: wrap; gap: 6px; }
}
```

- [ ] **Step 4: MotoboyOngoing.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .mainGrid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .mapBox { height: 260px; }
  .actionBtns { flex-direction: column; }
  .actionBtn { width: 100%; }
}
```

- [ ] **Step 5: MotoboyWallet.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .balanceCard { padding: 20px; }
  .balanceAmount { font-size: 30px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .transactionItem { flex-wrap: wrap; }
  .actionBtn { width: 100%; }
}
```

- [ ] **Step 6: MotoboyRanking.module.css — adicionar/substituir `@media` existente**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .podium { gap: 12px; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .podium { flex-direction: column; align-items: center; }
  .podiumCard { width: 100%; max-width: 280px; }
  .rankingItem { padding: 10px 12px; }
  .rankingAvatar { width: 36px; height: 36px; font-size: 14px; }
}
```

- [ ] **Step 7: MotoboyGamification.module.css — adicionar/substituir `@media` existente**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .badgesGrid { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .statsRow { flex-direction: column; gap: 10px; }
  .statBox { width: 100%; }
  .badgesGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .progressBar { height: 8px; }
}
```

- [ ] **Step 8: MotoboyBeneficios.module.css — adicionar/substituir `@media` existente**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .benefitsGrid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .benefitsGrid { grid-template-columns: 1fr; }
  .benefitCard { padding: 16px; }
}
```

- [ ] **Step 9: MotoboyPublicProfile.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .heroSection { flex-direction: column; align-items: center; text-align: center; gap: 12px; }
  .avatarImg { width: 80px; height: 80px; }
  .pageTitle { font-size: 22px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 10: MotoboyRequestWithdrawal.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .card { padding: 20px 16px; }
  .pageTitle { font-size: 22px; }
  .input { font-size: 16px; }
  .submitBtn { width: 100%; }
  .bankInfo { flex-direction: column; gap: 8px; }
}
```

- [ ] **Step 11: MotoboyTransferWallet.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .card { padding: 20px 16px; }
  .pageTitle { font-size: 22px; }
  .input { font-size: 16px; }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 12: Commit**

```bash
git add pages/motoboy/
git commit -m "style(motoboy): responsive layouts for all motoboy pages"
```

---

## Task 16: Páginas Admin

**Files:**
- Modify: `frontend/pages/admin/AdminDashboard.module.css`
- Modify: `frontend/pages/admin/AdminUsers.module.css`
- Modify: `frontend/pages/admin/AdminWallets.module.css`
- Modify: `frontend/pages/admin/AdminWithdrawals.module.css`
- Modify: `frontend/pages/admin/AdminAppCashbox.module.css`
- Modify: `frontend/pages/admin/AdminPlanApprovals.module.css`
- Modify: `frontend/pages/admin/AdminSettings.module.css`
- Modify: `frontend/pages/admin/AdminPricingConfig.module.css`
- Modify: `frontend/pages/admin/AdminUsers.module.css`
- Modify: `frontend/pages/admin/Conversas.module.css`
- Modify: `frontend/pages/admin/Permissoes.module.css`
- Modify: `frontend/pages/admin/SeasonalTheme.module.css`

- [ ] **Step 1: AdminDashboard.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); }
  .quickAccessGrid { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .quickAccessGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .kpiCard { padding: 14px; }
}
```

- [ ] **Step 2: AdminUsers.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .tableWrapper { overflow-x: auto; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .filtersRow { flex-direction: column; gap: 8px; }
  .searchInput { width: 100%; }
  .tableWrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { min-width: 600px; }
}
```

- [ ] **Step 3: AdminWallets.module.css e AdminWithdrawals.module.css — padrão igual (tabelas com scroll)**

Adicionar ao final de cada um:

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .tableWrapper { overflow-x: auto; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .filtersRow { flex-direction: column; gap: 8px; }
  .tableWrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { min-width: 560px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 4: AdminAppCashbox.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); }
  .tableWrapper { overflow-x: auto; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .statsGrid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .tableWrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { min-width: 540px; }
}
```

- [ ] **Step 5: AdminPlanApprovals.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .approvalCard { padding: 14px; flex-direction: column; gap: 12px; }
  .approvalActions { flex-direction: row; gap: 8px; }
  .approveBtn, .rejectBtn { flex: 1; }
}
```

- [ ] **Step 6: AdminSettings.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .settingsGrid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .fieldGrid2 { grid-template-columns: 1fr; }
  .input { font-size: 16px; }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 7: AdminPricingConfig.module.css — adicionar/substituir `@media` existente**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .plansGrid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .plansGrid { grid-template-columns: 1fr; }
  .planCard { padding: 16px; }
  .input { font-size: 16px; }
}
```

- [ ] **Step 8: Conversas.module.css — adicionar ao final**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .mainGrid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .conversationList { max-height: 300px; }
}
```

- [ ] **Step 9: Permissoes.module.css e SeasonalTheme.module.css — adicionar/substituir `@media` existente em cada**

Para Permissoes:
```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .permissionsGrid { grid-template-columns: 1fr; }
  .permCard { padding: 14px; }
}
```

Para SeasonalTheme:
```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .previewGrid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .colorGrid { grid-template-columns: repeat(2, 1fr); }
  .submitBtn { width: 100%; }
}
```

- [ ] **Step 10: Commit**

```bash
git add pages/admin/
git commit -m "style(admin): responsive layouts for all admin pages"
```

---

## Task 17: Componentes compartilhados — Footer, BannerCarousel, StoreOrderStatus

**Files:**
- Modify: `frontend/components/Footer.module.css`
- Modify: `frontend/components/BannerCarousel.module.css`
- Modify: `frontend/pages/store-order/StoreOrderStatus.module.css`
- Modify: `frontend/pages/AvaliarMotoboy.module.css` (já feito em Task 12)

- [ ] **Step 1: Footer.module.css — adicionar/complementar `@media` existente**

O Footer já tem 2 `@media`. Verificar os seletores e atualizar para:

```css
@media (max-width: 1024px) {
  .container { padding: 40px 20px 20px; }
  .linksGrid { grid-template-columns: repeat(2, 1fr); gap: 24px; }
}

@media (max-width: 640px) {
  .container { padding: 32px 16px 16px; }
  .brand { margin-bottom: 24px; }
  .linksGrid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .colTitle { font-size: 12px; }
  .link { font-size: 13px; }
  .bottomInner { flex-direction: column; gap: 12px; text-align: center; }
  .bottomLinks { flex-wrap: wrap; justify-content: center; }
}
```

- [ ] **Step 2: BannerCarousel.module.css — adicionar/complementar `@media` existente**

```css
@media (max-width: 1024px) {
  .slide { height: 280px; }
}

@media (max-width: 640px) {
  .slide { height: 200px; border-radius: 8px; }
  .dot { width: 8px; height: 8px; }
  .arrowBtn { width: 32px; height: 32px; }
}
```

- [ ] **Step 3: StoreOrderStatus.module.css — adicionar/substituir `@media` existente**

```css
@media (max-width: 1024px) {
  .container { padding: 20px 16px; }
  .mainGrid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .container { padding: 16px; }
  .pageTitle { font-size: 22px; }
  .statusCard { padding: 14px; }
  .timelineItem { padding: 10px 12px; }
  .mapBox { height: 220px; }
}
```

- [ ] **Step 4: Commit**

```bash
git add components/Footer.module.css components/BannerCarousel.module.css pages/store-order/StoreOrderStatus.module.css
git commit -m "style(shared): responsive footer, banner carousel and order status"
```

---

## Task 18: Demais componentes e páginas restantes

**Files:**
- Modify: `frontend/pages/seller/SellerOrder.module.css` (já em Task 14)
- Modify: `frontend/pages/motoboy/MotoboyHistory.module.css` (já em Task 15)
- Modify: `frontend/components/StoreBannerUpload.module.css`
- Modify: `frontend/components/OperatingHoursEditor.module.css`
- Modify: `frontend/components/ImageCropUploader.module.css`
- Modify: `frontend/pages/motoboy/MotoboyPublicProfile.module.css` (já em Task 15)
- Modify: `frontend/pages/store/StoreOrderStatus já coberto`

- [ ] **Step 1: StoreBannerUpload.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .uploadArea { padding: 20px 16px; }
  .uploadIcon { font-size: 32px; }
  .uploadText { font-size: 14px; }
  .previewImg { height: 160px; }
  .actionBtns { flex-direction: column; gap: 8px; }
  .btn { width: 100%; }
}
```

- [ ] **Step 2: OperatingHoursEditor.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .dayRow { flex-direction: column; gap: 8px; }
  .dayLabel { min-width: unset; }
  .timeInputs { flex-direction: column; gap: 6px; }
  .input { font-size: 16px; }
}
```

- [ ] **Step 3: ImageCropUploader.module.css — adicionar ao final**

```css
@media (max-width: 640px) {
  .container { padding: 16px; }
  .cropArea { height: 260px; }
  .controlsRow { flex-direction: column; gap: 8px; }
  .btn { width: 100%; }
}
```

- [ ] **Step 4: Commit**

```bash
git add components/StoreBannerUpload.module.css components/OperatingHoursEditor.module.css components/ImageCropUploader.module.css
git commit -m "style(components): responsive upload and editor components"
```

---

## Task 19: Revisão final e ajustes

- [ ] **Step 1: Testar em múltiplos tamanhos**

Abrir o browser e testar cada rota principal nos seguintes tamanhos:
- 375px (iPhone SE / pequeno)
- 414px (iPhone Pro)
- 768px (iPad / tablet)
- 1024px (tablet landscape / notebook pequeno)
- 1440px (desktop padrão)

Rotas a testar: `/`, `/stores`, uma loja, um produto, `/checkout`, `/user-dashboard`, `/store-dashboard`, `/login`, `/register`, `/motoboy`, `/admin/dashboard`

- [ ] **Step 2: Verificar sem scroll horizontal**

Em cada página, confirmar que `document.documentElement.scrollWidth === document.documentElement.clientWidth` (sem overflow horizontal).

No console do browser:
```js
console.log(document.documentElement.scrollWidth, document.documentElement.clientWidth)
// Devem ser iguais
```

- [ ] **Step 3: Verificar touch targets**

Confirmar que botões e links têm pelo menos 44px de altura em mobile (especialmente no Nav e nas ações principais).

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "style: final responsive adjustments after cross-device review"
```

---

## Resumo de arquivos modificados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `styles/globals.css` | CSS utilities |
| `components/Nav.module.css` | CSS + novo hamburger/overlay |
| `components/Nav.tsx` | TSX: estado + JSX overlay |
| `pages/Index.module.css` | CSS media queries |
| `pages/Stores.module.css` | CSS media queries |
| `pages/stores/StoreDetail.module.css` | CSS media queries |
| `pages/product/ProductDetail.module.css` | CSS media queries |
| `pages/Checkout.module.css` | CSS media queries |
| `pages/CheckoutVitrine.module.css` | CSS media queries |
| `pages/OrderDetail.module.css` | CSS media queries |
| `pages/UserDashboard.module.css` | CSS + `.tabsMobile` |
| `pages/user-dashboard.tsx` | TSX: `<select>` mobile |
| `pages/StoreDashboard.module.css` | CSS + `.tabsMobile` |
| `pages/store-dashboard.tsx` | TSX: `<select>` mobile |
| `pages/Login.module.css` | CSS media queries |
| `pages/Register.module.css` | CSS media queries |
| `pages/BankSetup.module.css` | CSS media queries |
| `pages/UserProfile.module.css` | CSS media queries |
| `pages/AvaliarMotoboy.module.css` | CSS media queries |
| `pages/Notifications.module.css` | CSS media queries |
| `pages/Suporte.module.css` | CSS media queries |
| `pages/MyWallet.module.css` | CSS media queries |
| `pages/seller/*.module.css` (7 arquivos) | CSS media queries |
| `pages/motoboy/*.module.css` (11 arquivos) | CSS media queries |
| `pages/admin/*.module.css` (10 arquivos) | CSS media queries |
| `components/Footer.module.css` | CSS media queries |
| `components/BannerCarousel.module.css` | CSS media queries |
| `components/StoreBannerUpload.module.css` | CSS media queries |
| `components/OperatingHoursEditor.module.css` | CSS media queries |
| `components/ImageCropUploader.module.css` | CSS media queries |
| `pages/store-order/StoreOrderStatus.module.css` | CSS media queries |
