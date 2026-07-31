import { useState, type ReactNode } from 'react';
import {
  ShoppingBag, Cpu, PenTool, Flame, PawPrint, Home, Search, PackageX, Inbox,
} from 'lucide-react';

import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Input } from '../components/ui/Input';
import { SearchField } from '../components/ui/SearchField';
import { Select } from '../components/ui/Select';
import { Chip } from '../components/ui/Chip';
import { Badge } from '../components/ui/Badge';
import { Tag } from '../components/ui/Tag';
import { StatusPill } from '../components/ui/StatusPill';
import { PriceTag } from '../components/ui/PriceTag';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Sheet } from '../components/ui/Sheet';
import { Toast } from '../components/ui/Toast';

import { Logo } from '../components/drop/Logo';
import { AppHeader } from '../components/drop/AppHeader';
import { AddressBar } from '../components/drop/AddressBar';
import { CategoryRail } from '../components/drop/CategoryRail';
import { PromoHero } from '../components/drop/PromoHero';
import { FreteBanner } from '../components/drop/FreteBanner';
import { OrderTracker } from '../components/drop/OrderTracker';
import { StoreCard } from '../components/drop/StoreCard';
import { ProductCard } from '../components/drop/ProductCard';
import { RepeatRow } from '../components/drop/RepeatRow';
import { StickyCart } from '../components/drop/StickyCart';
import { TabBar } from '../components/drop/TabBar';

/* ---------- helpers de layout (página só de dev) ---------- */
const noop = () => {};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--space-10)' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--text-strong)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--line)', paddingBottom: 'var(--space-2)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>{title}</h3>
      {children}
    </div>
  );
}
function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>;
}

/* ---------- dados de exemplo ---------- */
const COLOR_TOKENS = [
  ['--brand', '#6C2BD9'], ['--brand-2', '#8B5CF6'], ['--bg', '#0A0A0A'],
  ['--surface', '#151021'], ['--surface-2', '#1b1526'], ['--text', '#EDEBF2'],
  ['--text-muted', '#8f8aa0'], ['--success', '#3ddc84'], ['--rating', '#ffb020'], ['--danger', '#ff5a5f'],
];
const RADII = ['--r-sm', '--r-md', '--r-lg', '--r-xl', '--r-2xl', '--r-pill'];
const store = { name: 'TechStore', imageUrl: undefined, status: 'aberta' as const, category: 'Eletrônicos • Acessórios', rating: 4.8, etaMin: [25, 35] as [number, number], fee: 5.9 };
const product = { name: 'Fone Bluetooth', store: 'TechStore', imageUrl: undefined, price: 129.9, oldPrice: 189.9, discountPercent: 31 };
const longProduct = { name: 'Fone Bluetooth Over-Ear com Cancelamento de Ruído e Estojo', store: 'TechStore', imageUrl: undefined, price: 129.9, discountPercent: 20 };
const categories = [
  { id: 'todos', label: 'Todos', icon: <ShoppingBag /> },
  { id: 'elet', label: 'Eletrônicos', icon: <Cpu /> },
  { id: 'papel', label: 'Papelaria', icon: <PenTool /> },
  { id: 'tabac', label: 'Tabacaria', icon: <Flame /> },
  { id: 'pet', label: 'Pet', icon: <PawPrint /> },
];
const PRODUCT_VARIANTS = ['home', 'busca', 'loja', 'carrinho', 'recomendado'] as const;
const STATUSES = ['aberta', 'fechada', 'em_entrega', 'cancelado', 'entregue'] as const;

export default function Styleguide() {
  // Página só de desenvolvimento — não renderiza em produção.
  if (process.env.NODE_ENV === 'production') return null;

  const [inputVal, setInputVal] = useState('');
  const [searchVal, setSearchVal] = useState('');
  const [selectVal, setSelectVal] = useState('a');
  const [activeCat, setActiveCat] = useState('todos');
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--space-6) var(--space-5) 140px', background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, color: 'var(--text-strong)', letterSpacing: '.02em', marginBottom: 'var(--space-2)' }}>DROP Design System</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 'var(--space-10)' }}>Validação visual da fundação — bate com o mock canônico <code>home-refinada.html</code>.</p>

      {/* ============ FUNDAÇÃO ============ */}
      <Section title="Cores">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--space-3)' }}>
          {COLOR_TOKENS.map(([tok, hex]) => (
            <div key={tok}>
              <div style={{ height: 48, borderRadius: 'var(--r-md)', background: `var(${tok})`, border: '1px solid var(--line)' }} />
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text)' }}>{tok}</div>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{hex}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografia">
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--text-strong)' }}>Space Grotesk 700 — títulos / DROP</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-strong)' }}>Space Grotesk 600 — seção</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--text)' }}>Inter 400 — corpo do app, texto de leitura.</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>Inter — meta (nota, tempo, taxa).</div>
      </Section>

      <Section title="Raio & Espaçamento">
        <Row>
          {RADII.map((r) => (
            <div key={r} style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: `var(${r})` }} />
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>{r}</div>
            </div>
          ))}
        </Row>
      </Section>

      {/* ============ PRIMITIVOS ============ */}
      <Section title="Primitivos">
        <Sub title="Button (variantes + estados)">
          <Row>
            <Button variant="primary" onClick={noop}>Primary</Button>
            <Button variant="ghost" onClick={noop}>Ghost</Button>
            <Button variant="onImage" onClick={noop}>On image</Button>
            <Button variant="primary" size="sm" onClick={noop}>Small</Button>
            <Button variant="primary" loading onClick={noop}>Salvando</Button>
            <Button variant="primary" disabled onClick={noop}>Disabled</Button>
          </Row>
        </Sub>
        <Sub title="IconButton (brand / soft / brandSquare)">
          <Row>
            <IconButton variant="brand" icon={<ShoppingBag />} aria-label="Brand" onClick={noop} />
            <IconButton variant="soft" icon={<ShoppingBag />} aria-label="Soft" onClick={noop} />
            <IconButton variant="brandSquare" icon={<Search />} aria-label="Filtro" onClick={noop} />
          </Row>
        </Sub>
        <Sub title="Input / SearchField / Select">
          <div style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: 380 }}>
            <Input value={inputVal} onChange={setInputVal} placeholder="Campo normal" leftIcon={<Search size={16} />} />
            <Input value="" onChange={noop} placeholder="Com erro" error="Campo obrigatório" />
            <SearchField value={searchVal} onChange={setSearchVal} placeholder="Buscar produtos ou lojas…" onFilter={noop} />
            <Select value={selectVal} onChange={setSelectVal} options={[{ value: 'a', label: 'Opção A' }, { value: 'b', label: 'Opção B' }]} />
          </div>
        </Sub>
        <Sub title="Chip / Badge / Tag / StatusPill / PriceTag">
          <Row>
            <Chip icon={<Cpu size={16} />} label="Eletrônicos" active onClick={noop} />
            <Chip icon={<PenTool size={16} />} label="Papelaria" onClick={noop} />
            <Badge tone="discount">20% OFF</Badge>
            <Badge tone="count">3</Badge>
            <Badge tone="seal">31% OFF</Badge>
            <Tag>Eletrônicos • Acessórios</Tag>
          </Row>
          <div style={{ height: 'var(--space-3)' }} />
          <Row>
            {STATUSES.map((s) => <StatusPill key={s} status={s} />)}
            <PriceTag price={129.9} oldPrice={189.9} />
          </Row>
        </Sub>
        <Sub title="Card / Sheet / Toast">
          <Row>
            <Card style={{ padding: 'var(--space-4)', maxWidth: 220 }}>Card de agrupamento (borda funcional).</Card>
            <Button variant="primary" onClick={() => setSheetOpen(true)}>Abrir Sheet</Button>
          </Row>
          <div style={{ height: 'var(--space-3)' }} />
          <Row>
            <Toast message="Adicionado ao carrinho" tone="success" />
            <Toast message="Pagamento recusado" tone="error" />
            <Toast message="Novo entregador atribuído" tone="info" />
          </Row>
          <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Endereços">
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Conteúdo do bottom sheet (fecha no backdrop ou Esc).</p>
          </Sheet>
        </Sub>
      </Section>

      {/* ============ CHROME ============ */}
      <Section title="Chrome de delivery">
        <Sub title="Logo / AppHeader / AddressBar / TabBar"><div style={{ background: 'var(--bg)', borderRadius: 'var(--r-lg)', border: '1px solid var(--line)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4)' }}><Logo /></div>
          <AppHeader notifications={1} onBell={noop} onAvatar={noop} />
          <div style={{ padding: '0 var(--space-4) var(--space-3)' }}><AddressBar address="Av. Paulista, 1578" onClick={noop} /></div>
          <div style={{ position: 'relative', height: 64 }}><TabBar active="inicio" onNavigate={noop} /></div>
        </div></Sub>
      </Section>

      {/* ============ COMPONENTES DE DELIVERY ============ */}
      <Section title="Componentes de delivery">
        <Sub title="OrderTracker (elemento dominante)">
          <OrderTracker orderId="2481" storeName="TechStore" etaMin={12} etaLabel="chega às 9:53" progress={0.66}
            steps={[{ label: 'Confirmado', done: true }, { label: 'Saiu p/ entrega', done: true }, { label: 'Chegando', done: false }]} />
        </Sub>
        <Sub title="CategoryRail">
          <CategoryRail categories={categories} activeId={activeCat} onSelect={setActiveCat} />
        </Sub>
        <Sub title="PromoHero / FreteBanner">
          <PromoHero tag="PROMO DA SEMANA" title="Fone + Case + Cabo" subtitle="Kit acessórios em oferta" price={129.9} oldPrice={189.9} discountPercent={31} onCta={noop} ctaLabel="Peça agora" />
          <div style={{ height: 'var(--space-3)' }} />
          <FreteBanner title="Frete grátis acima de R$ 40" ctaLabel="Aproveitar" onCta={noop} />
        </Sub>
        <Sub title="StoreCard (destaque + resultado)">
          <StoreCard variant="destaque" store={store} onClick={noop} />
          <div style={{ height: 'var(--space-3)' }} />
          <StoreCard variant="resultado" store={store} onClick={noop} />
          <StoreCard variant="resultado" store={{ ...store, name: 'Papel & Cia', category: 'Papelaria • Escritório', rating: 4.6, fee: 4.9 }} onClick={noop} />
        </Sub>
        <Sub title="ProductCard — todas as variantes por contexto">
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {PRODUCT_VARIANTS.map((v) => (
              <div key={v} style={{ minWidth: 160 }}>
                <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginBottom: 4 }}>{v}</div>
                <ProductCard variant={v} product={product} onAdd={noop} />
              </div>
            ))}
          </div>
        </Sub>
        <Sub title="RepeatRow">
          <RepeatRow product={product} onAdd={noop} />
          <RepeatRow product={{ ...product, name: 'Cabo USB-C 2m', price: 23.9, oldPrice: undefined, discountPercent: undefined }} onAdd={noop} />
        </Sub>
      </Section>

      {/* ============ ESTADOS ============ */}
      <Section title="Estados">
        <Sub title="Loading">
          <div style={{ display: 'grid', gap: 'var(--space-2)', maxWidth: 300 }}>
            <Skeleton height={88} radius={16} />
            <Skeleton width="70%" />
            <Skeleton width="40%" />
          </div>
        </Sub>
        <Sub title="Vazio">
          <EmptyState icon={<Inbox />} title="Nenhum pedido ainda" description="Seus pedidos aparecem aqui." action={<Button variant="primary" onClick={noop}>Explorar lojas</Button>} />
        </Sub>
        <Sub title="Imagem ausente">
          <div style={{ maxWidth: 160 }}><ProductCard variant="home" product={{ name: 'Produto sem foto', store: 'Loja', price: 49.9 }} onAdd={noop} /></div>
        </Sub>
        <Sub title="Conteúdo longo">
          <div style={{ maxWidth: 160 }}><ProductCard variant="home" product={longProduct} onAdd={noop} /></div>
        </Sub>
      </Section>

      <StickyCart count={2} total={57.8} onOpen={noop} />
    </div>
  );
}
