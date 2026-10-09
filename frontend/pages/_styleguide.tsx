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

import { Checkbox } from '../components/ui/Checkbox';
import { Switch } from '../components/ui/Switch';
import { Tabs } from '../components/ui/Tabs';
import { Alert } from '../components/ui/Alert';
import { Avatar } from '../components/ui/Avatar';
import { QuantitySelector } from '../components/ui/QuantitySelector';
import { Rating } from '../components/ui/Rating';
import { ProgressBar } from '../components/ui/ProgressBar';
import { DeliveryBadge } from '../components/drop/DeliveryBadge';
import { OrderStatusBadge, type CustomerOrderStatus } from '../components/drop/OrderStatusBadge';
import { PriceDisplay } from '../components/drop/PriceDisplay';
import { OrderSummary } from '../components/drop/OrderSummary';
import { OrderTimeline } from '../components/drop/OrderTimeline';
import { CartItem } from '../components/drop/CartItem';

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
const ORDER_STATUSES: CustomerOrderStatus[] = ['awaiting_payment', 'awaiting_store', 'preparing', 'finding_courier', 'out_for_delivery', 'delivered', 'cancelled', 'problem'];

/* ---------- DS v2: componentes novos, renderizados dentro de um tema ---------- */
function V2Label({ children }: { children: ReactNode }) {
  return <div style={{ font: 'var(--text-caption)', color: 'var(--color-text-muted)', margin: 'var(--space-5) 0 var(--space-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{children}</div>;
}

function V2Gallery({ theme }: { theme: 'light' | 'dark' }) {
  const [terms, setTerms] = useState(true);
  const [wallet, setWallet] = useState(false);
  const [tab, setTab] = useState('andamento');
  const [qty, setQty] = useState(2);
  const [cartQty, setCartQty] = useState(1);
  const [stars, setStars] = useState(4);

  return (
    <div data-theme={theme} style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', font: 'var(--text-body)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-default)', minWidth: 0 }}>
      <div style={{ font: 'var(--text-title)' }}>Tema {theme === 'light' ? 'claro' : 'escuro'}</div>

      <V2Label>Checkbox · Switch</V2Label>
      <Checkbox label="Aceito os termos de uso" description="Você pode ler os termos antes de pagar." checked={terms} onChange={setTerms} />
      <Checkbox label="Opção desabilitada" checked={false} onChange={noop} disabled />
      <Switch label="Usar saldo da carteira" description="Saldo disponível: R$ 18,20" checked={wallet} onChange={setWallet} />

      <V2Label>Tabs</V2Label>
      <Tabs label="Pedidos" idPrefix={`sg-${theme}`} items={[{ id: 'andamento', label: 'Em andamento', count: 2 }, { id: 'historico', label: 'Histórico' }]} value={tab} onChange={setTab} />

      <V2Label>Alert (4 tons)</V2Label>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <Alert tone="error" title="Não entregamos nesse endereço" action={{ label: 'Trocar endereço', onClick: noop }}>A loja entrega até 12 km.</Alert>
        <Alert tone="warning" title="Informe seu CPF">O Pix exige o CPF de quem paga.</Alert>
        <Alert tone="info">A taxa de entrega é calculada pela rota real.</Alert>
        <Alert tone="success" title="Pagamento aprovado" />
      </div>

      <V2Label>Avatar · Rating · ProgressBar</V2Label>
      <Row>
        <Avatar name="Ana Souza" size="sm" />
        <Avatar name="Carlos Lima" />
        <Avatar name="Bruno" size="lg" />
        <Rating value={4.83} count={32} />
      </Row>
      <Rating value={stars} onChange={setStars} label="Avalie a loja" />
      <div style={{ marginTop: 'var(--space-2)' }}><ProgressBar value={3} max={4} label="Progresso do pedido" /></div>

      <V2Label>QuantitySelector</V2Label>
      <Row>
        <QuantitySelector itemName="Fone" value={qty} onChange={setQty} max={5} />
        <QuantitySelector itemName="Cabo" size="sm" value={1} onChange={noop} min={0} />
      </Row>

      <V2Label>PriceDisplay (linha · card · produto)</V2Label>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <PriceDisplay size="line" price={23.9} />
        <PriceDisplay price={129.9} oldPrice={189.9} />
        <PriceDisplay size="product" price={240} oldPrice={299} installment={{ count: 12, installmentValue: 21.8, total: 261.6 }} />
      </div>

      <V2Label>DeliveryBadge (todos os estados)</V2Label>
      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <DeliveryBadge state={{ kind: 'fast', minutes: 35 }} />
        <DeliveryBadge state={{ kind: 'today', until: '18h' }} />
        <DeliveryBadge state={{ kind: 'tomorrow' }} />
        <DeliveryBadge state={{ kind: 'free' }} />
        <DeliveryBadge state={{ kind: 'fee', fee: 7.4 }} />
        <DeliveryBadge state={{ kind: 'noAddress', onSetAddress: noop }} />
        <DeliveryBadge state={{ kind: 'loading' }} />
        <DeliveryBadge state={{ kind: 'outOfArea', address: 'Av. Paulista, 1578', onChangeAddress: noop }} />
      </div>

      <V2Label>OrderStatusBadge</V2Label>
      <Row>{ORDER_STATUSES.map((s) => <OrderStatusBadge key={s} status={s} />)}</Row>

      <V2Label>OrderTimeline</V2Label>
      <OrderTimeline steps={[
        { label: 'Pedido confirmado', time: '14:02', state: 'done' },
        { label: 'Em preparação', time: '14:05', state: 'done' },
        { label: 'Saiu para entrega', time: '14:21', detail: 'Carlos · moto ABC1D23', state: 'current' },
        { label: 'Entregue', state: 'upcoming' },
      ]} />

      <V2Label>CartItem + OrderSummary (sacola)</V2Label>
      <div style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <CartItem item={{ name: 'Fone Bluetooth JBL Tune 520', price: 199.9, quantity: qty, variant: 'Preto', maxQuantity: 5 }} onQuantityChange={setQty} />
      </div>
      <div style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <CartItem item={{ name: 'Cabo USB-C 2m', price: 39.9, quantity: cartQty }} onQuantityChange={(n) => setCartQty(Math.max(n, 1))} />
      </div>
      <CartItem item={{ name: 'Capa de silicone', price: 29.9, quantity: 1, unavailable: true }} onQuantityChange={noop} />
      <div style={{ marginTop: 'var(--space-4)' }}>
        <OrderSummary
          lines={[
            { label: 'Subtotal (2 itens)', value: 269.8 },
            { label: 'Entrega · 2,4 km', value: 7.4 },
            { label: 'Cupom SEMANATECH', value: -15, tone: 'credit' },
            { label: 'Saldo da carteira', value: -18.2, tone: 'credit' },
          ]}
          total={244}
        />
      </div>
    </div>
  );
}

export default function Styleguide() {
  const [inputVal, setInputVal] = useState('');
  const [searchVal, setSearchVal] = useState('');
  const [selectVal, setSelectVal] = useState('a');
  const [activeCat, setActiveCat] = useState('todos');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Página só de desenvolvimento — não renderiza em produção (depois dos hooks).
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-6) var(--space-5) 140px', background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, color: 'var(--text-strong)', letterSpacing: '.02em', marginBottom: 'var(--space-2)' }}>DROP Design System</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 'var(--space-10)' }}>Validação visual da fundação — bate com o mock canônico <code>home-refinada.html</code>.</p>

      {/* ============ DS v2 ============ */}
      <Section title="DS v2 — componentes novos (claro × escuro)">
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 'var(--space-4)' }}>
          Só tokens semânticos (<code>--color-*</code>). O mesmo componente, sem nenhuma mudança, nos dois temas.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-4)' }}>
          <V2Gallery theme="light" />
          <V2Gallery theme="dark" />
        </div>
      </Section>

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
            <Button variant="secondary" onClick={noop}>Secondary</Button>
            <Button variant="tertiary" onClick={noop}>Tertiary</Button>
            <Button variant="danger" onClick={noop}>Danger</Button>
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
