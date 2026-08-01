import dotenv from 'dotenv';
dotenv.config();
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

/**
 * Seed de demonstração: 10 lojas (5 premium/Plano 3 + 5 Plano 2), cada uma com
 * banner e 5 produtos. Todas pertencem a um dono demo (demo-lojas@drop.test) e
 * ficam SEM coordenadas (latitude/longitude nulas) de propósito — assim o filtro
 * de proximidade nunca as esconde e elas aparecem em qualquer lugar.
 *
 * Idempotente: apaga as lojas do dono demo (produtos caem em cascata) e recria.
 * Uso: npx ts-node src/scripts/seedDemoStores.ts   (ou: npm run seed:stores)
 */

const PASS = 'Senha@123456';
const banner = (slug: string) => `https://picsum.photos/seed/${slug}-banner/1000/500`;
const productImg = (slug: string, i: number) => `https://picsum.photos/seed/${slug}-p${i}/500/500`;

interface StoreDef {
  name: string;
  slug: string;
  plan: 2 | 3;
  city: string;
  products: { name: string; price: number }[];
}

const STORES: StoreDef[] = [
  // ── 5 Premium (Plano 3) ────────────────────────────────────────────────
  { name: 'Burger Prime', slug: 'burger-prime', plan: 3, city: 'Centro', products: [
    { name: 'Smash Duplo', price: 32.9 }, { name: 'Cheddar Bacon', price: 36.5 },
    { name: 'Veggie Supremo', price: 29.9 }, { name: 'Batata Rústica', price: 18 },
    { name: 'Milk Shake Ovomaltine', price: 22 },
  ] },
  { name: 'Sushi Zen', slug: 'sushi-zen', plan: 3, city: 'Centro', products: [
    { name: 'Combo 20 peças', price: 59.9 }, { name: 'Temaki Salmão', price: 27 },
    { name: 'Hot Roll (8un)', price: 24 }, { name: 'Uramaki Filadélfia', price: 28 },
    { name: 'Guioza (6un)', price: 21 },
  ] },
  { name: 'Pizza Nobile', slug: 'pizza-nobile', plan: 3, city: 'Centro', products: [
    { name: 'Margherita', price: 44.9 }, { name: 'Calabresa', price: 46.9 },
    { name: 'Portuguesa', price: 49.9 }, { name: 'Quatro Queijos', price: 52 },
    { name: 'Doce de Nutella', price: 48 },
  ] },
  { name: 'Café Aurora', slug: 'cafe-aurora', plan: 3, city: 'Centro', products: [
    { name: 'Cappuccino Cremoso', price: 14.9 }, { name: 'Croissant de Amêndoas', price: 16 },
    { name: 'Bowl de Açaí', price: 24 }, { name: 'Pão de Queijo (6un)', price: 12 },
    { name: 'Cheesecake de Frutas', price: 19 },
  ] },
  { name: 'Doce Encanto', slug: 'doce-encanto', plan: 3, city: 'Centro', products: [
    { name: 'Bolo no Pote', price: 15 }, { name: 'Brigadeiro Gourmet (6un)', price: 18 },
    { name: 'Torta de Limão', price: 39 }, { name: 'Cookie Recheado', price: 12 },
    { name: 'Caixa de Trufas (9un)', price: 45 },
  ] },
  // ── 5 Plano 2 ──────────────────────────────────────────────────────────
  { name: 'Mercado do Bairro', slug: 'mercado-bairro', plan: 2, city: 'Centro', products: [
    { name: 'Arroz 5kg', price: 27.9 }, { name: 'Feijão 1kg', price: 8.5 },
    { name: 'Óleo de Soja 900ml', price: 7.9 }, { name: 'Açúcar 1kg', price: 5.5 },
    { name: 'Café 500g', price: 16.9 },
  ] },
  { name: 'Padaria Trigo Dourado', slug: 'padaria-trigo', plan: 2, city: 'Centro', products: [
    { name: 'Pão Francês (kg)', price: 16.9 }, { name: 'Bolo de Fubá', price: 22 },
    { name: 'Sonho de Creme', price: 6.5 }, { name: 'Baguete Artesanal', price: 12 },
    { name: 'Pão de Forma Integral', price: 14 },
  ] },
  { name: 'Hortifruti Verde', slug: 'hortifruti-verde', plan: 2, city: 'Centro', products: [
    { name: 'Banana Prata (kg)', price: 6.9 }, { name: 'Tomate (kg)', price: 8.9 },
    { name: 'Alface Crespa', price: 3.5 }, { name: 'Maçã Gala (kg)', price: 11.9 },
    { name: 'Cenoura (kg)', price: 5.9 },
  ] },
  { name: 'Farmácia Vida', slug: 'farmacia-vida', plan: 2, city: 'Centro', products: [
    { name: 'Dipirona 500mg (10cp)', price: 9.9 }, { name: 'Álcool em Gel 500ml', price: 14 },
    { name: 'Vitamina C (60cp)', price: 29.9 }, { name: 'Protetor Solar FPS50', price: 45 },
    { name: 'Máscara Facial (kit)', price: 22 },
  ] },
  { name: 'Pet Amigo', slug: 'pet-amigo', plan: 2, city: 'Centro', products: [
    { name: 'Ração Cães 3kg', price: 49.9 }, { name: 'Areia Higiênica 4kg', price: 27 },
    { name: 'Brinquedo Mordedor', price: 19 }, { name: 'Petisco Natural', price: 15 },
    { name: 'Shampoo Pet 500ml', price: 24 },
  ] },
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
  for (const def of STORES) {
    const store = await prisma.store.create({
      data: {
        ownerId: owner.id,
        name: def.name,
        plan: def.plan,
        city: def.city,
        featuredBannerUrl: banner(def.slug), // banner de destaque (carrossel usa nos premium)
        coverBannerUrl: banner(def.slug),
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
        image: productImg(def.slug, i + 1),
      })),
    });
    totalProducts += def.products.length;
    console.log(`✅ ${def.name} (Plano ${def.plan}) + ${def.products.length} produtos`);
  }

  console.log(`\n🎉 ${STORES.length} lojas (5 premium + 5 plano 2) e ${totalProducts} produtos criados.`);
}

run()
  .catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
