import { Response, Request } from 'express';
import { AuthenticatedRequest } from '../types';

import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { toApiDelivery } from '../repositories/delivery.repository';
import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';



import { slugify } from '../utils/slugify';
import { emitStoreCreated, emitStoreUpdated } from '../utils/socketEmitter';
import logger from '../config/logger';
import { findSubByStoreId } from '../repositories/storeSubscription.repository';
import { uploadToCloudinary } from '../utils/cloudinary';

// Painel do lojista: métricas e pedidos
export const dashboard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Not authenticated' });
    const store = await prisma.store.findFirst({ where: { ownerId } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    // Pedidos da loja — NÃO mostrar PIX ainda não pago (cliente está na tela do QR;
    // o pedido só "chega" pra loja depois que o pagamento é confirmado).
    // `$nor` (não é PIX-pendente-criado) vira `NOT { AND ... }` no Prisma.
    const rawOrders = await prisma.order.findMany({
      where: {
        storeId: store.id,
        NOT: { paymentMethod: 'pix', paymentStatus: 'pending', status: 'criado' },
      },
      include: orderInclude,
    });
    const orders = rawOrders.map(toApiOrder);
    // Métricas
    const totalSales = orders.length;
    const delivered = orders.filter(o => o.status === 'entregue').length;
    const ongoing = orders.filter(o => o.status !== 'entregue' && o.status !== 'cancelado' && o.status !== 'rejeitado').length;
    // ✅ CORRIGIDO: Usar apenas a receita da loja (storeAmount) que já tem comissão descontada
    // Não incluir taxa de entrega (que é receita da plataforma/motoboy)
    const revenue = orders.reduce((sum, o) => {
      if (o.walletDistribution?.storeAmount) {
        return sum + o.walletDistribution.storeAmount;
      }
      // Fallback: se walletDistribution não existir, descontar apenas do subtotal (totalValue - deliveryFee)
      // e aplicar comissão padrão de 10%
      const productTotal = (o.totalValue || 0) - (o.deliveryFee || 0);
      const appCommission = productTotal * 0.10; // 10% padrão
      return sum + (productTotal - appCommission);
    }, 0);
    // Enriquecer pedidos com delivery info
    const ordersWithDelivery = await Promise.all(orders.map(async o => {
      let delivery = null;
      if (o.deliveryId) {
        // Sem `.populate('motoboyId')`: o motoboy é um User, que vive no Postgres.
        // O populate ficaria silenciosamente vazio, e o nome sumiria da tela.
        const d = await prisma.delivery.findUnique({ where: { id: String(o.deliveryId) } });
        if (d) {
          const motoboy = d.motoboyId
            ? await prisma.user.findUnique({ where: { id: String(d.motoboyId) }, select: { name: true } })
            : null;
          delivery = { ...toApiDelivery(d), motoboyName: motoboy?.name };
        }
      }
      // Busca nome do comprador
      let customerName = undefined;
      let customerObj = undefined;
      if (o.customerId) {
        customerObj = await prisma.user.findUnique({ where: { id: String(o.customerId) }, select: { id: true, name: true } });
        if (customerObj && customerObj.name) customerName = customerObj.name;
      }
      // Busca nome da loja
      let storeName = undefined;
      let storeObj = undefined;
      if (o.storeId) {
        storeObj = await prisma.store.findUnique({ where: { id: String(o.storeId) }, select: { id: true, name: true } });
        if (storeObj && storeObj.name) storeName = storeObj.name;
      }
      // Busca nomes dos produtos
      let productsWithNames = [];
      if (Array.isArray(o.products)) {
        productsWithNames = await Promise.all(o.products.map(async (prod: any) => {
          let prodId = prod.productId;
          let productObj = null;
          if (prodId) {
            productObj = await prisma.product.findUnique({ where: { id: String(prodId) }, include: { category: { select: { name: true } } } }) as any;
          }
          // Garante que sempre retorna nome, imagem e categoria
          return {
            ...prod,
            productName: productObj ? productObj.name : 'Produto removido',
            image: productObj ? productObj.image : null,
            category: productObj?.category && typeof productObj.category === 'object' 
              ? (productObj.category as any).name 
              : productObj?.category,
            product: productObj
          };
        }));
      }
      return {
        ...o,
        delivery,
        customerName,
        customerObj,
        storeName: storeName || 'Loja removida',
        storeObj,
        products: productsWithNames
      };
    }));
    // Separar pedidos em andamento e histórico
    const ongoingOrders = ordersWithDelivery.filter(o => o.status !== 'entregue' && o.status !== 'cancelado' && o.status !== 'rejeitado');
    const historyOrders = ordersWithDelivery.filter(o => o.status === 'entregue' || o.status === 'cancelado' || o.status === 'rejeitado');
    
    // 🔍 Buscar todas as categorias únicas dos produtos da loja (com populate para trazer nomes)
    const products = await prisma.product.findMany({ where: { storeId: store.id }, include: { category: { select: { name: true } } } }) as any[];
    const categories = [...new Set(
      products
        .map(p => {
          // Se category for um objeto (populado), pegar o name; se for string, usar direto
          if (p.category && typeof p.category === 'object' && (p.category as any).name) {
            return (p.category as any).name;
          }
          return p.category;
        })
        .filter(c => c)
    )].sort();
    
    // Sincronizar plan com StoreSubscription (source of truth)
    const subscription = await findSubByStoreId(store.id);
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const planFromSub = subscription ? planNumberMap[subscription.currentPlan] ?? 1 : (store.plan ?? 1);
    if (store.plan !== planFromSub) {
      await prisma.store.update({ where: { id: store.id }, data: { plan: planFromSub } });
    }
    const storeWithPlan = { ...store, _id: store.id, plan: planFromSub };

    return res.json({
      metrics: { totalSales, delivered, ongoing, revenue },
      orders: ongoingOrders,
      history: historyOrders,
      store: storeWithPlan,
      categories
    });
  } catch (err) {
    console.error('[dashboard] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar painel do lojista' });
  }
};

// Helper: verifica se loja está aberta agora com base no horário de funcionamento
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type DayKey = typeof DAYS[number];

/** `store` aceita tanto o registro do Prisma quanto o objeto plano usado nas rotas. */
export function isStoreCurrentlyOpen(store: { isOpen?: boolean | null; operatingHours?: any }): boolean {
  // Toggle manual sobrepõe tudo
  if (!store.isOpen) return false;

  const hours = store.operatingHours;
  // Se não configurou horários, considera sempre aberta (isOpen=true)
  if (!hours) return true;

  const now = new Date();
  const dayKey = DAYS[now.getDay()] as DayKey;
  const dayConfig = (hours as any)[dayKey] as { open?: string; close?: string; closed?: boolean } | undefined;

  // Dia sem configuração = aberta
  if (!dayConfig) return true;
  // Dia marcado como fechado
  if (dayConfig.closed) return false;
  // Sem horário definido = aberta
  if (!dayConfig.open || !dayConfig.close) return true;

  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(dayConfig.open) || !timeRegex.test(dayConfig.close)) {
    logger.warn('Formato de horário inválido na loja', { open: dayConfig.open, close: dayConfig.close });
    return true; // sem horário válido = tratar como aberta
  }

  const [openH, openM] = dayConfig.open.split(':').map(Number);
  const [closeH, closeM] = dayConfig.close.split(':').map(Number);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

// Atualizar horário de funcionamento da loja
export const updateOperatingHours = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const ownerId = req.user?.id;

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    if (String(store.ownerId) !== ownerId) return res.status(403).json({ error: 'Sem permissão' });

    const { operatingHours, isOpen } = req.body;

    const updated = await prisma.store.update({
      where: { id },
      data: {
        ...(typeof isOpen === 'boolean' ? { isOpen } : {}),
        ...(operatingHours ? { operatingHours } : {}),
      },
    });

    return res.json({ success: true, store: { isOpen: updated.isOpen, operatingHours: updated.operatingHours } });
  } catch (err) {
    logger.error('Erro ao atualizar horários da loja', err as Error);
    return res.status(500).json({ error: 'Erro ao atualizar horários' });
  }
};

// Listar avaliações recebidas pela loja
export const listarAvaliacoesLoja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // storeId
    const avaliacoes = await prisma.order.findMany({
      where: { storeId: id, storeRating: { not: null } },
      select: { storeRating: true, storeComment: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(avaliacoes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar avaliações da loja' });
  }
};

// Deletar loja e remover usuário lojista e dados relacionados
export const deleteStoreAndUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // id da loja
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || String(store.ownerId) !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }
    // Remove produtos e categorias da loja
    await prisma.product.deleteMany({ where: { storeId: store.id } });
    await prisma.category.deleteMany({ where: { storeId: store.id } });
    // Remove loja
    await prisma.store.delete({ where: { id: store.id } });
    // Remove usuário lojista
    await prisma.user.delete({ where: { id: String(store.ownerId) } });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete store and user' });
  }
};

export const createStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, address, cnpj, latitude, longitude, street, number, neighborhood, city, state, zip } = req.body;
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Not authenticated' });
    if (!name) return res.status(400).json({ error: 'Missing name' });
    // Prevent creating more than one store per user
    const existing = await prisma.store.findFirst({ where: { ownerId } });
    if (existing) return res.status(400).json({ error: 'User already has a store' });

    // ✅ CNPJ único entre lojas
    const { onlyDigits } = require('../utils/documentValidation');
    const cnpjDigits = cnpj ? onlyDigits(String(cnpj)) : '';
    if (cnpjDigits) {
      const dupCnpj = await prisma.store.findFirst({ where: { cnpj: cnpjDigits } });
      if (dupCnpj) return res.status(409).json({ error: 'Este CNPJ já está cadastrado em outra loja' });
    }

    // Persistir o endereço ESTRUTURADO já na criação (1º passo do fluxo) — vira o
    // endereço oficial da loja. Sem isso, Store.street ficava vazio e a tela de
    // Dados de Recebimento pedia o endereço de novo para o Asaas.
    const composedAddress = address
      || [street, number, neighborhood, city, state, zip].filter(Boolean).join(', ')
      || undefined;

    const store = await prisma.store.create({
      data: {
        ownerId,
        name,
        address: composedAddress,
        cnpj: cnpjDigits || cnpj,
        latitude,
        longitude,
        ...(street ? { street } : {}),
        ...(number ? { number } : {}),
        ...(neighborhood ? { neighborhood } : {}),
        ...(city ? { city } : {}),
        ...(state ? { state } : {}),
        ...(zip ? { zip: String(zip).replace(/\D/g, '') } : {}),
      },
    });

    // ✅ FIX: Atualizar user.storeId para que o wallet funcione
    await prisma.user.update({ where: { id: String(ownerId) }, data: { storeId: store.id } });
    console.log('✅ [CREATE_STORE] User.storeId atualizado:', { ownerId, storeId: store.id });

    // Broadcast store creation
    emitStoreCreated(store);
    
    return res.status(201).json(store);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to create store' });
  }
};

// Atualizar endereço e dados da loja
export const updateStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, street, number, neighborhood, city, state, zip, latitude, longitude, cnpj } = req.body;
    const ownerId = req.user?.id;

    if (!ownerId) return res.status(401).json({ error: 'Not authenticated' });

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return res.status(404).json({ error: 'Store not found' });

    // Verificar se o usuário é o dono da loja
    if (String(store.ownerId) !== ownerId) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    // ✅ KYC: editar endereço/CNPJ exige reverificação do item correspondente.
    // Compara com o valor atual (não basta vir no body) — assim salvar só o nome
    // não derruba a verificação de endereço da loja.
    const norm = (v: any) => (v === undefined || v === null) ? undefined : String(v).trim();
    const addressChanged = ([
      ['street', street], ['number', number], ['neighborhood', neighborhood],
      ['city', city], ['state', state], ['zip', zip],
    ] as [string, any][]).some(([k, v]) => v !== undefined && norm(v) !== norm((store as any)[k]));
    const { onlyDigits } = require('../utils/documentValidation');
    const cnpjChanged = cnpj !== undefined && onlyDigits(String(cnpj)) !== onlyDigits(String(store.cnpj || ''));
    // `verification` é JSONB: montamos o objeto inteiro e gravamos de uma vez.
    const verification: any = store.verification ?? { cnpj: { status: 'none' }, address: { status: 'none' } };
    const data: any = {};
    if (addressChanged) verification.address = { status: 'none' };
    if (cnpjChanged) {
      // ✅ CNPJ não muda depois de aprovado, e tem que ser único entre lojas.
      if (verification.cnpj?.status === 'approved') {
        return res.status(409).json({ error: 'O CNPJ não pode ser alterado após ser aprovado. Entre em contato com o suporte.' });
      }
      const cnpjDigits = onlyDigits(String(cnpj));
      if (cnpjDigits) {
        const dupCnpj = await prisma.store.findFirst({ where: { id: { not: store.id }, cnpj: cnpjDigits } });
        if (dupCnpj) return res.status(409).json({ error: 'Este CNPJ já está cadastrado em outra loja' });
      }
      data.cnpj = cnpjDigits;
      verification.cnpj = { status: 'none' };
    }
    if (addressChanged || cnpjChanged) data.verification = verification;

    // Atualizar campos individuais
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (street) data.street = street;
    if (number) data.number = number;
    if (neighborhood) data.neighborhood = neighborhood;
    if (city) data.city = city;
    if (state) data.state = state;
    if (zip) data.zip = zip;
    if (latitude) data.latitude = String(latitude);
    if (longitude) data.longitude = String(longitude);

    // Construir endereço completo para o campo address (com os valores já atualizados)
    const merged = { ...store, ...data };
    const addressParts = [merged.street, merged.number, merged.neighborhood, merged.city, merged.state, merged.zip].filter(Boolean);
    data.address = addressParts.join(', ');

    const saved = await prisma.store.update({ where: { id }, data });

    // Recalcular o status verificado da loja (pode ter perdido a verificação)
    if (addressChanged || cnpjChanged) {
      const { recomputeStoreVerification } = require('../utils/storeVerification');
      await recomputeStoreVerification(id);
    }
    
    // Broadcast store update
    emitStoreUpdated(saved);
    
    return res.json(store);
  } catch (err) {
    console.error('[updateStore] error:', err);
    return res.status(500).json({ error: 'Failed to update store' });
  }
};

export const listStores = async (_req: Request, res: Response) => {
  try {
    // ✅ GATE KYC (Fase 2): com KYC_ENFORCED, só lojas verificadas aparecem.
    const filter: any = {};
    if (process.env.KYC_ENFORCED === 'true') filter.isVerified = true;
    const found = await prisma.store.findMany({ where: filter });
    // `_id` junto de `id`: o frontend ainda lê `_id`.
    return res.json(found.map((st) => ({ ...st, _id: st.id })));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to list stores' });
  }
};

// Upload de banner da loja (apenas Plano 3)
export const uploadStoreBanner = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Não autenticado' });

    const store = await prisma.store.findFirst({ where: { ownerId } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    const sub = await findSubByStoreId(store.id);
    const planMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlan = sub ? (planMap[sub.currentPlan] ?? 1) : (store.plan ?? 1);
    if (storePlan !== 3) return res.status(403).json({ error: 'Recurso exclusivo do Plano 3 (Premium)' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const type = (req.query.type as string) === 'cover' ? 'cover' : 'featured';
    const url = await uploadToCloudinary(file.buffer, 'drop/banners');

    await prisma.store.update({
      where: { id: store.id },
      data: type === 'cover' ? { coverBannerUrl: url } : { featuredBannerUrl: url },
    });
    return res.json({ success: true, type, url });
  } catch (err) {
    console.error('[uploadStoreBanner] error:', err);
    return res.status(500).json({ error: 'Erro ao salvar banner' });
  }
};

// [Plan1] Retorna lojas em destaque (Plano 3 com featuredBannerUrl preenchido)
export const getFeaturedStores = async (_req: Request, res: Response) => {
  try {
    console.log('[Plan1] getFeaturedStores — buscando lojas Plano 3 com banner de destaque');
    // `{ $exists: true, $ne: '' }` vira "não nulo e diferente de vazio" no Prisma.
    const featuredFilter: any = {
      plan: 3,
      featuredBannerUrl: { not: null },
      NOT: { featuredBannerUrl: '' },
    };
    if (process.env.KYC_ENFORCED === 'true') featuredFilter.isVerified = true; // ✅ GATE KYC Fase 2

    const rows = await prisma.store.findMany({
      where: featuredFilter,
      select: { id: true, name: true, featuredBannerUrl: true, plan: true },
    });
    const stores = rows.map((st) => ({ ...st, _id: st.id }));
    return res.json(stores);
  } catch (err) {
    console.error('[getFeaturedStores] error:', err);
    return res.status(500).json({ error: 'Erro ao buscar lojas em destaque' });
  }
};

// GET /api/stores/:id/top-products?limit=8
// Endpoint público — retorna os produtos mais vendidos da loja nos últimos 30 dias.
// Usado na página pública da loja pra mostrar a seção "Mais vendidos".
export const getStoreTopProducts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 8, 24);

    // Busca direto pelo id. Antes havia um guard `/^[0-9a-fA-F]{24}$/` (formato
    // ObjectId) e um fallback por `slug` — o guard nunca casaria um cuid, e `slug`
    // não existe no schema (nem existia no Mongoose), então aquele caminho nunca
    // encontrou nada.
    const store: any = await prisma.store.findUnique({
      where: { id },
      select: { id: true, plan: true },
    });
    if (!store) return res.status(404).json({ error: 'Store not found' });

    // Feature exclusiva de lojas Plano 3 (premium)
    const storePlan = Number(store.plan) || 1;
    if (storePlan !== 3) {
      return res.json({ products: [], premiumRequired: true });
    }

    const BILLABLE_STATUSES: any[] = ['pago', 'aguardando_motoboy', 'enviado', 'entregue'];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Mais vendidos: agrupa OrderItem por produto, filtrando pelos pedidos da loja
    // (billable, últimos 30d) via filtro na relação. Substitui o pipeline Mongo
    // ($unwind products → $group → $lookup products).
    const grouped = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: { storeId: store.id, createdAt: { gte: start }, status: { in: BILLABLE_STATUSES } },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    const productMap = new Map(
      (await prisma.product.findMany({ where: { id: { in: grouped.map((g) => g.productId) } } }))
        .map((p) => [p.id, p]),
    );

    // Filtra produtos órfãos (deletados) e monta a mesma forma de saída.
    const products = grouped
      .map((g) => {
        const p = productMap.get(g.productId) as any;
        if (!p) return null;
        return {
          _id: g.productId,
          quantity: g._sum.quantity ?? 0,
          name: p.name,
          image: p.image,
          price: Number(p.price),
          category: p.categoryId,
          stock: p.quantity,
        };
      })
      .filter(Boolean);

    return res.json({ products });
  } catch (err) {
    console.error('[storeController.getStoreTopProducts] error:', err);
    return res.status(500).json({ error: 'Failed to get top products' });
  }
};

// Buscar loja por id ou slug
export const getStore = async (req: Request<{ idOrSlug: string }>, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    // Ver nota em getStoreFeaturedProducts: o guard de ObjectId e o fallback por
    // `slug` foram removidos — `slug` nunca existiu no schema.
    const store: any = await prisma.store.findUnique({ where: { id: idOrSlug } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    // ✅ GATE KYC Fase 2: loja não verificada não aparece publicamente
    if (process.env.KYC_ENFORCED === 'true' && !(store as any).isVerified) {
      return res.status(404).json({ error: 'Store not found' });
    }
    return res.json(store);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to get store' });
  }
};
