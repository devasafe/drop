import { Response, Request } from 'express';
import { AuthenticatedRequest } from '../types';
import Store, { IStore, IOperatingHoursDay } from '../models/Store';
import Order from '../models/Order';
import User from '../models/User';
import Product from '../models/Product';
import Category from '../models/Category';
import Delivery from '../models/Delivery';
import { slugify } from '../utils/slugify';
import { emitStoreCreated, emitStoreUpdated } from '../utils/socketEmitter';
import logger from '../config/logger';
import StoreSubscription from '../models/StoreSubscription';
import { uploadToCloudinary } from '../utils/cloudinary';

// Painel do lojista: métricas e pedidos
export const dashboard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Not authenticated' });
    const store = await Store.findOne({ ownerId });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    // Pedidos da loja
    const orders = await Order.find({ storeId: store._id }).lean();
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
        const d = await Delivery.findById(o.deliveryId)
          .populate({ path: 'motoboyId', select: 'name' })
          .lean();
        if (d) {
          let motoboyName = undefined;
          if (d.motoboyId && typeof d.motoboyId === 'object' && (d.motoboyId as any).name) {
            motoboyName = (d.motoboyId as any).name;
          }
          delivery = { ...d, motoboyName };
        }
      }
      // Busca nome do comprador
      let customerName = undefined;
      let customerObj = undefined;
      if (o.customerId) {
        customerObj = await User.findById(o.customerId).select('name').lean();
        if (customerObj && customerObj.name) customerName = customerObj.name;
      }
      // Busca nome da loja
      let storeName = undefined;
      let storeObj = undefined;
      if (o.storeId) {
        storeObj = await Store.findById(o.storeId).select('name').lean();
        if (storeObj && storeObj.name) storeName = storeObj.name;
      }
      // Busca nomes dos produtos
      let productsWithNames = [];
      if (Array.isArray(o.products)) {
        productsWithNames = await Promise.all(o.products.map(async (prod: any) => {
          let prodId = prod.productId;
          let productObj = null;
          if (prodId) {
            productObj = await Product.findById(prodId).populate('category', 'name').lean();
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
    const products = await Product.find({ storeId: store._id }).populate('category', 'name').lean();
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
    const subscription = await StoreSubscription.findOne({ storeId: store._id.toString() }).lean();
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const planFromSub = subscription ? planNumberMap[subscription.currentPlan] ?? 1 : (store.plan ?? 1);
    if (store.plan !== planFromSub) {
      await Store.findByIdAndUpdate(store._id, { plan: planFromSub });
    }
    const storeWithPlan = { ...store.toObject(), plan: planFromSub };

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

export function isStoreCurrentlyOpen(store: IStore): boolean {
  // Toggle manual sobrepõe tudo
  if (!store.isOpen) return false;

  const hours = store.operatingHours;
  // Se não configurou horários, considera sempre aberta (isOpen=true)
  if (!hours) return true;

  const now = new Date();
  const dayKey = DAYS[now.getDay()] as DayKey;
  const dayConfig = (hours as any)[dayKey] as IOperatingHoursDay | undefined;

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

    const store = await Store.findById(id);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    if (store.ownerId.toString() !== ownerId) return res.status(403).json({ error: 'Sem permissão' });

    const { operatingHours, isOpen } = req.body;

    if (typeof isOpen === 'boolean') store.isOpen = isOpen;
    if (operatingHours) store.operatingHours = operatingHours;

    await store.save();
    return res.json({ success: true, store: { isOpen: store.isOpen, operatingHours: store.operatingHours } });
  } catch (err) {
    logger.error('Erro ao atualizar horários da loja', err as Error);
    return res.status(500).json({ error: 'Erro ao atualizar horários' });
  }
};

// Listar avaliações recebidas pela loja
export const listarAvaliacoesLoja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // storeId
    const avaliacoes = await Order.find({ storeId: id, storeRating: { $exists: true, $ne: null } }, { storeRating: 1, storeComment: 1, createdAt: 1 }).sort({ createdAt: -1 }).lean();
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
    const store = await Store.findById(id);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || store.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }
    // Remove produtos e categorias da loja
    await Product.deleteMany({ storeId: store._id });
    await Category.deleteMany({ storeId: store._id });
    // Remove loja
    await store.deleteOne();
    // Remove usuário lojista
    await User.findByIdAndDelete(store.ownerId);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete store and user' });
  }
};

export const createStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, address, cnpj, latitude, longitude } = req.body;
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Not authenticated' });
    if (!name) return res.status(400).json({ error: 'Missing name' });
    // Prevent creating more than one store per user
    const existing = await Store.findOne({ ownerId });
    if (existing) return res.status(400).json({ error: 'User already has a store' });

    const store = new Store({ ownerId, name, address, cnpj, latitude, longitude });
    await store.save();
    
    // ✅ FIX: Atualizar user.storeId para que o wallet funcione
    const User = require('../models/User').default;
    await User.findByIdAndUpdate(ownerId, { storeId: store._id }, { new: true });
    console.log('✅ [CREATE_STORE] User.storeId atualizado:', { ownerId, storeId: store._id });
    
    // Broadcast store creation
    emitStoreCreated(store.toObject());
    
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

    const store = await Store.findById(id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    // Verificar se o usuário é o dono da loja
    if (store.ownerId.toString() !== ownerId) {
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
    if (!store.verification) store.verification = { cnpj: { status: 'none' }, address: { status: 'none' } } as any;
    if (addressChanged) store.verification!.address = { status: 'none' };
    if (cnpjChanged) { store.cnpj = cnpj; store.verification!.cnpj = { status: 'none' }; }
    if (addressChanged || cnpjChanged) store.markModified('verification');

    // Atualizar campos individuais
    if (typeof name === 'string' && name.trim()) store.name = name.trim();
    if (street) store.street = street;
    if (number) store.number = number;
    if (neighborhood) store.neighborhood = neighborhood;
    if (city) store.city = city;
    if (state) store.state = state;
    if (zip) store.zip = zip;
    if (latitude) store.latitude = String(latitude);
    if (longitude) store.longitude = String(longitude);

    // Construir endereço completo para o campo address
    const addressParts = [store.street, store.number, store.neighborhood, store.city, store.state, store.zip].filter(Boolean);
    store.address = addressParts.join(', ');

    await store.save();

    // Recalcular o status verificado da loja (pode ter perdido a verificação)
    if (addressChanged || cnpjChanged) {
      const { recomputeStoreVerification } = require('../utils/storeVerification');
      await recomputeStoreVerification(id);
    }
    
    // Broadcast store update
    emitStoreUpdated(store.toObject());
    
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
    const stores = await Store.find(filter).lean();
    return res.json(stores);
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

    const store = await Store.findOne({ ownerId });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    const sub = await StoreSubscription.findOne({ storeId: store._id.toString() }).lean();
    const planMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlan = sub ? (planMap[sub.currentPlan] ?? 1) : (store.plan ?? 1);
    if (storePlan !== 3) return res.status(403).json({ error: 'Recurso exclusivo do Plano 3 (Premium)' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const type = (req.query.type as string) === 'cover' ? 'cover' : 'featured';
    const url = await uploadToCloudinary(file.buffer, 'drop/banners');

    if (type === 'cover') {
      store.coverBannerUrl = url;
    } else {
      store.featuredBannerUrl = url;
    }

    await store.save();
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
    const featuredFilter: any = { plan: 3, featuredBannerUrl: { $exists: true, $ne: '' } };
    if (process.env.KYC_ENFORCED === 'true') featuredFilter.isVerified = true; // ✅ GATE KYC Fase 2
    const stores = await Store.find(featuredFilter)
      .select('_id name featuredBannerUrl plan')
      .lean();
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

    // Resolver storeId (aceita ObjectId ou slug, igual getStore)
    let store: any = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      store = await Store.findById(id).select('_id plan').lean();
    }
    if (!store) {
      store = await Store.findOne({ slug: id }).select('_id plan').lean();
    }
    if (!store) return res.status(404).json({ error: 'Store not found' });

    // Feature exclusiva de lojas Plano 3 (premium)
    const storePlan = Number(store.plan) || 1;
    if (storePlan !== 3) {
      return res.json({ products: [], premiumRequired: true });
    }

    const BILLABLE_STATUSES = ['pago', 'aguardando_motoboy', 'enviado', 'entregue'];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { Types } = require('mongoose');

    const rows = await Order.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(store._id),
          createdAt: { $gte: start },
          status: { $in: BILLABLE_STATUSES },
        },
      },
      { $unwind: '$products' },
      {
        $group: {
          _id: '$products.productId',
          quantity: { $sum: '$products.quantity' },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quantity: 1,
          name: '$product.name',
          image: '$product.image',
          price: '$product.price',
          category: '$product.category',
          stock: '$product.stock',
        },
      },
    ]);

    // Filtrar produtos órfãos (que foram deletados)
    const products = rows.filter((r: any) => r.name);

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
    let store = null;
    if (idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
      store = await Store.findById(idOrSlug).lean();
    }
    if (!store) {
      store = await Store.findOne({ slug: idOrSlug }).lean();
    }
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
