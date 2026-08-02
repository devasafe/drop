import dotenv from 'dotenv';
dotenv.config();
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

/**
 * Seed de demonstração: 10 lojas (5 premium/Plano 3 + 5 Plano 2), cada uma com
 * banner e 5 produtos. DROP é delivery de COISAS NÃO ESSENCIAIS (gadgets,
 * presentes, beleza, games, decoração…) — não comida. Todas pertencem a um dono
 * demo (demo-lojas@drop.test) e ficam SEM coordenadas (latitude/longitude nulas)
 * de propósito — assim o filtro de proximidade nunca as esconde.
 *
 * Fotos temáticas via loremflickr (palavra-chave + lock estável).
 * Idempotente: apaga as lojas do dono demo (produtos caem em cascata) e recria.
 * Uso: npx ts-node src/scripts/seedDemoStores.ts   (ou: npm run seed:stores)
 */

const PASS = 'Senha@123456';
// Imagem temática por palavra-chave (lock = imagem estável e única).
const img = (kw: string, w: number, h: number, lock: number) =>
  `https://loremflickr.com/${w}/${h}/${kw}?lock=${lock}`;

interface ProductDef { name: string; price: number; kw: string }
interface StoreDef {
  name: string;
  slug: string;
  plan: 2 | 3;
  city: string;
  bannerKw: string;
  products: ProductDef[];
}

const STORES: StoreDef[] = [
  // ── 5 Premium (Plano 3) ────────────────────────────────────────────────
  { name: 'TechDrop', slug: 'techdrop', plan: 3, city: 'Centro', bannerKw: 'electronics', products: [
    { name: 'Fone Bluetooth TWS', price: 189.9, kw: 'earbuds' },
    { name: 'Smartwatch Fit', price: 249.9, kw: 'smartwatch' },
    { name: 'Caixa de Som Portátil', price: 219, kw: 'speaker' },
    { name: 'Power Bank 20000mAh', price: 139, kw: 'powerbank' },
    { name: 'Ring Light 26cm', price: 99, kw: 'ringlight' },
  ] },
  { name: 'GameZone', slug: 'gamezone', plan: 3, city: 'Centro', bannerKw: 'gaming', products: [
    { name: 'Controle Sem Fio', price: 279, kw: 'gamepad' },
    { name: 'Headset Gamer RGB', price: 199, kw: 'headset' },
    { name: 'Mousepad Speed XL', price: 79, kw: 'mousepad' },
    { name: 'Teclado Mecânico', price: 329, kw: 'keyboard' },
    { name: 'Mouse Gamer 16000dpi', price: 159, kw: 'mouse' },
  ] },
  { name: 'Bella Beauty', slug: 'bella-beauty', plan: 3, city: 'Centro', bannerKw: 'cosmetics', products: [
    { name: 'Kit Skincare Completo', price: 189, kw: 'skincare' },
    { name: 'Perfume Importado 100ml', price: 349, kw: 'perfume' },
    { name: 'Paleta de Sombras', price: 89, kw: 'makeup' },
    { name: 'Secador Profissional', price: 279, kw: 'hairdryer' },
    { name: 'Máscara Facial (kit 5)', price: 59, kw: 'facemask' },
  ] },
  { name: 'Presente Perfeito', slug: 'presente-perfeito', plan: 3, city: 'Centro', bannerKw: 'gift', products: [
    { name: 'Cesta de Chocolates', price: 129, kw: 'chocolate' },
    { name: 'Buquê de Flores', price: 99, kw: 'bouquet' },
    { name: 'Kit Vinho & Taças', price: 199, kw: 'wine' },
    { name: 'Urso de Pelúcia G', price: 149, kw: 'teddybear' },
    { name: 'Caixa Surpresa', price: 89, kw: 'giftbox' },
  ] },
  { name: 'Casa Chique', slug: 'casa-chique', plan: 3, city: 'Centro', bannerKw: 'homedecor', products: [
    { name: 'Luminária de Mesa', price: 159, kw: 'lamp' },
    { name: 'Vaso Decorativo', price: 89, kw: 'vase' },
    { name: 'Quadro Canvas', price: 119, kw: 'painting' },
    { name: 'Almofada Estampada', price: 69, kw: 'pillow' },
    { name: 'Difusor de Aromas', price: 79, kw: 'candle' },
  ] },
  // ── 5 Plano 2 ──────────────────────────────────────────────────────────
  { name: 'AcessóriosZZ', slug: 'acessorios-zz', plan: 2, city: 'Centro', bannerKw: 'smartphone', products: [
    { name: 'Capinha Personalizada', price: 39.9, kw: 'phonecase' },
    { name: 'Película 3D', price: 24.9, kw: 'screenprotector' },
    { name: 'Carregador Turbo', price: 59, kw: 'charger' },
    { name: 'Suporte Veicular', price: 45, kw: 'phoneholder' },
    { name: 'Cabo USB-C Trançado', price: 29, kw: 'cable' },
  ] },
  { name: 'Brinca Mais', slug: 'brinca-mais', plan: 2, city: 'Centro', bannerKw: 'toys', products: [
    { name: 'Blocos de Montar 500pç', price: 129, kw: 'lego' },
    { name: 'Boneca Fashion', price: 89, kw: 'doll' },
    { name: 'Carrinho de Controle', price: 149, kw: 'toycar' },
    { name: 'Quebra-cabeça 1000pç', price: 59, kw: 'puzzle' },
    { name: 'Pelúcia Fofa', price: 49, kw: 'plush' },
  ] },
  { name: 'Vintage Style', slug: 'vintage-style', plan: 2, city: 'Centro', bannerKw: 'fashion', products: [
    { name: 'Óculos de Sol', price: 119, kw: 'sunglasses' },
    { name: 'Relógio Casual', price: 199, kw: 'watch' },
    { name: 'Boné Aba Reta', price: 69, kw: 'cap' },
    { name: 'Carteira de Couro', price: 89, kw: 'wallet' },
    { name: 'Mochila Urbana', price: 179, kw: 'backpack' },
  ] },
  { name: 'PetLux', slug: 'petlux', plan: 2, city: 'Centro', bannerKw: 'dog', products: [
    { name: 'Roupinha Pet', price: 49, kw: 'dogclothes' },
    { name: 'Brinquedo Mordedor', price: 29, kw: 'dogtoy' },
    { name: 'Casinha Fofa', price: 199, kw: 'doghouse' },
    { name: 'Coleira Estilosa', price: 39, kw: 'dogcollar' },
    { name: 'Comedouro Design', price: 59, kw: 'petbowl' },
  ] },
  { name: 'Flor & Cia', slug: 'flor-cia', plan: 2, city: 'Centro', bannerKw: 'flowers', products: [
    { name: 'Kit de Suculentas', price: 69, kw: 'succulent' },
    { name: 'Orquídea no Vaso', price: 89, kw: 'orchid' },
    { name: 'Buquê de Girassóis', price: 79, kw: 'sunflower' },
    { name: 'Planta Artificial', price: 59, kw: 'plant' },
    { name: 'Cachepô Decorativo', price: 45, kw: 'flowerpot' },
  ] },
];

// Avisos de exemplo do carrossel da home (2:1). Idempotente: recriados por título.
const DEMO_BANNERS = [
  { title: 'Cupom BEMVINDO10 — 10% off no 1º pedido', imageUrl: img('sale', 1000, 500, 901), linkUrl: '/produtos', sortOrder: 0 },
  { title: 'Frete grátis acima de R$ 40', imageUrl: img('delivery', 1000, 500, 902), linkUrl: '/stores', sortOrder: 1 },
];

async function run() {
  const passwordHash = await bcrypt.hash(PASS, 10);
  const owner = await prisma.user.upsert({
    where: { email: 'demo-lojas@drop.test' },
    update: { passwordHash },
    create: {
      email: 'demo-lojas@drop.test',
      passwordHash,
      name: 'Dono Demo (Lojas)',
      role: 'lojista',
      roles: ['lojista', 'cliente'],
      activeRole: 'lojista',
      status: 'active',
      verification: { email: { status: 'verified', verifiedAt: new Date() } },
    },
  });

  // Idempotência: remove lojas anteriores do dono demo (produtos em cascata).
  const removed = await prisma.store.deleteMany({ where: { ownerId: owner.id } });
  console.log(`🧹 Removidas ${removed.count} loja(s) demo antiga(s).`);

  let totalProducts = 0;
  for (let s = 0; s < STORES.length; s++) {
    const def = STORES[s];
    const store = await prisma.store.create({
      data: {
        ownerId: owner.id,
        name: def.name,
        plan: def.plan,
        city: def.city,
        featuredBannerUrl: img(def.bannerKw, 1000, 500, s * 10), // banner (carrossel usa nos premium)
        coverBannerUrl: img(def.bannerKw, 1000, 500, s * 10),
        isVerified: true,
        isOpen: true,
        latitude: null,
        longitude: null,
      },
    });
    await prisma.product.createMany({
      data: def.products.map((p, i) => ({
        storeId: store.id,
        name: p.name,
        description: `${p.name} — ${def.name}`,
        price: p.price,
        quantity: 25,
        image: img(p.kw, 500, 500, s * 10 + i + 1),
      })),
    });
    totalProducts += def.products.length;
    console.log(`✅ ${def.name} (Plano ${def.plan}) + ${def.products.length} produtos`);
  }

  console.log(`\n🎉 ${STORES.length} lojas (5 premium + 5 plano 2) e ${totalProducts} produtos criados.`);

  // Avisos de exemplo (carrossel da home). Idempotente por título.
  await prisma.promoBanner.deleteMany({ where: { title: { in: DEMO_BANNERS.map((b) => b.title) } } });
  for (const b of DEMO_BANNERS) {
    await prisma.promoBanner.create({ data: { ...b, active: true } });
  }
  console.log(`📣 ${DEMO_BANNERS.length} avisos de exemplo criados.`);
}

run()
  .catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
