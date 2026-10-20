import { Response, Request, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { toApiDelivery, stripDeliveryPins } from '../repositories/delivery.repository';
import { toPublicStore, toOwnerStore } from '../repositories/store.repository';
import { withStoreRatings } from '../services/catalog/storeRatings';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import userRepository from '../repositories/user.repository';



import { slugify } from '../utils/slugify';
import { emitStoreCreated, emitStoreUpdated } from '../utils/socketEmitter';
import logger from '../config/logger';
import { findSubByStoreId } from '../repositories/storeSubscription.repository';
import { uploadToCloudinary } from '../utils/cloudinary';
import { checkImageSpec } from '../utils/imageSpecs';
import { publicStoreBillingWhere, isStoreHiddenByBilling } from '../services/saasBilling/gate';
import { getDeliveryConfig } from '../services/deliveryQuote/config';
import { toApiProduct } from './productController';
import { findPublicCouponsForStore } from '../repositories/coupon.repository';
import { ACTIVE_PRODUCT_WHERE } from '../services/catalog/activeProduct';
import { isStoreOpenWithHoursNow } from '../utils/storeOpen';
import { openOverrideUntilFor } from '../utils/storeHours';
import { AppError } from '../utils/AppError';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { acceptDeadline, isAwaitingStoreAccept, storeAcceptTimeoutMin } from '../utils/acceptDeadline';

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
    // Prazo do aceite: mesmo relógio do job storeAcceptTimeout (config, nunca 5 min fixo).
    const timeoutMin = storeAcceptTimeoutMin(await getPlatformConfig());
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
          // Loja digita o PIN que o motoboy mostra — nunca recebe PIN nenhum.
          delivery = { ...stripDeliveryPins(toApiDelivery(d)), motoboyName: motoboy?.name };
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
        acceptDeadline: isAwaitingStoreAccept(o) ? acceptDeadline(o, timeoutMin).toISOString() : null,
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
    const storeWithPlan = toOwnerStore({ ...store, _id: store.id, plan: planFromSub });

    return res.json({
      metrics: { totalSales, delivered, ongoing, revenue },
      orders: ongoingOrders,
      history: historyOrders,
      store: storeWithPlan,
      categories,
      // Produtos do dono: o painel não pode depender de GET /products (loja pausada some da vitrine).
      products: products.map(toApiProduct),
    });
  } catch (err) {
    console.error('[dashboard] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar painel do lojista' });
  }
};

// Horário de funcionamento: lógica pura em utils/storeHours (reexportada p/ quem importa daqui).
export { isOpenAt, isStoreCurrentlyOpen } from '../utils/storeHours';


// Atualizar horário de funcionamento da loja
export const updateOperatingHours = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const ownerId = req.user?.id;

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    if (String(store.ownerId) !== ownerId) return res.status(403).json({ error: 'Sem permissão' });

    const { operatingHours, isOpen } = req.body;

    // Abrir (isOpen=true) fora do horário vale até a próxima virada: o servidor calcula o override
    // com o horário que vai ficar gravado. Dentro do horário, ou fechando, o override sai.
    // Sem isOpen no corpo o override fica como está.
    const override = typeof isOpen === 'boolean'
      ? { openOverrideUntil: isOpen ? openOverrideUntilFor({ operatingHours: operatingHours || store.operatingHours }) : null }
      : {};

    const updated = await prisma.store.update({
      where: { id },
      data: {
        ...(typeof isOpen === 'boolean' ? { isOpen } : {}),
        ...(operatingHours ? { operatingHours } : {}),
        ...override,
      },
    });

    return res.json({
      success: true,
      store: { isOpen: updated.isOpen, operatingHours: updated.operatingHours, openOverrideUntil: updated.openOverrideUntil },
    });
  } catch (err) {
    logger.error('Erro ao atualizar horários da loja', err as Error);
    return res.status(500).json({ error: 'Erro ao atualizar horários' });
  }
};

// Listar avaliações recebidas pela loja (pública). Array puro: o StoreReviews lê `r.data` como lista.
// Nunca dados do cliente; `orderId` é o que a loja usa para responder.
export const listarAvaliacoesLoja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // storeId
    const rows = await prisma.order.findMany({
      where: { storeId: id, storeRating: { not: null } },
      select: { id: true, storeRating: true, storeComment: true, createdAt: true, storeReply: true, storeRepliedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(rows.map(({ id: orderId, ...r }) => ({ orderId, ...r })));
  } catch (err) {
    logger.error('Erro ao buscar avaliações da loja', err as Error);
    return res.status(500).json({ error: 'Erro ao buscar avaliações da loja' });
  }
};

// Deletar loja e remover usuário lojista e dados relacionados
const STORE_HAS_CONSENT_BODY = {
  success: false,
  error: {
    message: 'Esta loja aceitou o termo de autorização do Asaas e não pode ser excluída. Fale com o suporte.',
    statusCode: 409,
    code: 'STORE_HAS_CONSENT',
  },
};
const storeHasConsent = () => Object.assign(new Error('STORE_HAS_CONSENT'), { storeHasConsent: true });

export const deleteStoreAndUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // id da loja
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || String(store.ownerId) !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }
    // Fail closed: a prova do aceite do termo Asaas (StoreAsaasConsent) é imutável e não
    // sai em cascata. Loja com termo aceito não é apagada. Checagem + remoções na MESMA
    // transação, com a loja travada antes da checagem: o aceite (que também trava a loja)
    // não entra entre a checagem e o delete — nada é apagado pela metade.
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Store" WHERE id = ${store.id} FOR UPDATE`;
      if (locked.length === 0) throw Object.assign(new Error('Store not found'), { storeGone: true });
      const consents = await tx.storeAsaasConsent.count({ where: { storeId: store.id } });
      if (consents > 0) throw storeHasConsent();
      // Remove produtos e categorias da loja
      await tx.product.deleteMany({ where: { storeId: store.id } });
      await tx.category.deleteMany({ where: { storeId: store.id } });
      // Remove loja
      await tx.store.delete({ where: { id: store.id } });
      // Remove usuário lojista
      await tx.user.delete({ where: { id: String(store.ownerId) } });
    });
    return res.json({ ok: true });
  } catch (err: any) {
    if (err?.storeHasConsent) return res.status(409).json(STORE_HAS_CONSENT_BODY);
    if (err?.storeGone) return res.status(404).json({ error: 'Store not found' });
    // Defesa extra: a FK Restrict do aceite recusou o delete da loja → a transação inteira voltou.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003'
      && String((err.meta as any)?.field_name || '').includes('StoreAsaasConsent')) {
      return res.status(409).json(STORE_HAS_CONSENT_BODY);
    }
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
    logger.debug('✅ [CREATE_STORE] User.storeId atualizado:', { ownerId, storeId: store.id });

    // Broadcast store creation
    emitStoreCreated(store);

    return res.status(201).json(toOwnerStore({ ...store, _id: store.id }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to create store' });
  }
};

const storeDeliverySettingsSchema = z.object({
  deliveryRadiusKm: z.number({ invalid_type_error: 'Raio de entrega inválido' }).min(1, 'O raio de entrega mínimo é 1 km').max(50, 'O raio de entrega máximo é 50 km').nullable().optional(),
  prepMinutes: z.number({ invalid_type_error: 'Tempo de preparo inválido' }).int('O tempo de preparo deve ser em minutos inteiros').min(0, 'O tempo de preparo mínimo é 0 min').max(180, 'O tempo de preparo máximo é 180 min').nullable().optional(),
});

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

    // Raio de entrega e tempo de preparo (null = volta ao padrão da plataforma).
    // O raio só pode diminuir o padrão; o servidor valida, o front só sugere.
    const deliverySettings: { deliveryRadiusKm?: number | null; prepMinutes?: number | null } = {};
    if (req.body.deliveryRadiusKm !== undefined || req.body.prepMinutes !== undefined) {
      const parsedSettings = storeDeliverySettingsSchema.safeParse({
        deliveryRadiusKm: req.body.deliveryRadiusKm,
        prepMinutes: req.body.prepMinutes,
      });
      if (!parsedSettings.success) {
        return res.status(400).json({ error: parsedSettings.error.issues[0]?.message || 'Configuração de entrega inválida' });
      }
      const radius = parsedSettings.data.deliveryRadiusKm;
      if (radius != null) {
        const { defaultRadiusKm } = await getDeliveryConfig();
        if (radius > defaultRadiusKm) {
          return res.status(400).json({ error: `O raio de entrega não pode passar de ${defaultRadiusKm} km (limite da plataforma)` });
        }
      }
      if (radius !== undefined) deliverySettings.deliveryRadiusKm = radius;
      if (parsedSettings.data.prepMinutes !== undefined) deliverySettings.prepMinutes = parsedSettings.data.prepMinutes;
    }

    // ✅ KYC: editar endereço/CNPJ exige reverificação do item correspondente.
    // Compara com o valor atual (não basta vir no body) — assim salvar só o nome
    // não derruba a verificação de endereço da loja.
    const norm = (v: any) => (v === undefined || v === null) ? undefined : String(v).trim();
    // CEP: compara e grava só os dígitos ("01310-100" e "01310100" são o mesmo CEP;
    // lojas antigas podem ter o CEP salvo com máscara).
    const zipDigits = (v: any) => (v === undefined || v === null) ? undefined : String(v).replace(/\D/g, '');
    // CEP vazio, null ou sem dígitos = "não enviado": fora da comparação e não sobrescreve o salvo.
    const zipNew = zipDigits(zip) || undefined;
    const addressChanged = ([
      ['street', street], ['number', number], ['neighborhood', neighborhood],
      ['city', city], ['state', state],
    ] as [string, any][]).some(([k, v]) => v !== undefined && norm(v) !== norm((store as any)[k]))
      || (!!zipNew && zipNew !== zipDigits((store as any).zip));
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
    if (zipNew) data.zip = zipNew;
    if (latitude) data.latitude = String(latitude);
    if (longitude) data.longitude = String(longitude);
    Object.assign(data, deliverySettings);
    // D1: identidade (logo, frase, capa) em todos os planos — já validada na borda (updateStoreIdentitySchema).
    if (req.body.logoUrl !== undefined) data.logoUrl = req.body.logoUrl;
    if (req.body.tagline !== undefined) data.tagline = req.body.tagline;
    if (req.body.coverBannerUrl !== undefined) data.coverBannerUrl = req.body.coverBannerUrl;

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

    return res.json(toOwnerStore({ ...saved, _id: saved.id }));
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
    // Modo direto: loja pausada/cancelada pela mensalidade some da vitrine.
    const billingWhere = await publicStoreBillingWhere();
    if (billingWhere) filter.AND = [billingWhere];
    const found = await prisma.store.findMany({ where: filter });
    // Rota pública: só o serializer de vitrine (nunca asaas/cnpj/verification/apiConfig).
    return res.json(await withStoreRatings(found.map(toPublicStore)));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to list stores' });
  }
};

// Upload de capa (cover, todos os planos — D1) ou banner de destaque da Home (featured, regra do Premium)
export const uploadStoreBanner = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Não autenticado' });

    const store = await prisma.store.findFirst({ where: { ownerId } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    const type = (req.query.type as string) === 'cover' ? 'cover' : 'featured';
    // A capa da página da loja vale para todos os planos (D1). O banner de destaque (carrossel da Home) aceita
    // Plano 3 ativo OU troca para o Plano 3 pendente: fica guardado antes da aprovação, mas a Home só mostra
    // com o Plano 3 ativo (getFeaturedStores e toPublicStore conferem na leitura).
    if (type === 'featured') {
      const sub = await findSubByStoreId(store.id);
      const planMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
      const storePlan = sub ? (planMap[sub.currentPlan] ?? 1) : (store.plan ?? 1);
      const premiumPending = !!sub && sub.planChangeStatus === 'pending' && sub.requestedPlan === 'plan3';
      if (storePlan !== 3 && !premiumPending) return res.status(403).json({ error: 'Recurso exclusivo do Plano 3 (Premium)' });
    }

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const sizeError = checkImageSpec(file.buffer, type === 'cover' ? 'cover' : 'featuredBanner');
    if (sizeError) return res.status(422).json({ error: sizeError, code: 'IMAGE_SIZE_INVALID' });

    const url = await uploadToCloudinary(file.buffer, 'drop/banners');

    await prisma.store.update({
      where: { id: store.id },
      data: type === 'cover' ? { coverBannerUrl: url } : { featuredBannerUrl: url },
    });
    return res.json({ success: true, type, url });
  } catch (err) {
    logger.error('[uploadStoreBanner] erro ao salvar banner', err as Error);
    return res.status(500).json({ error: 'Erro ao salvar banner' });
  }
};

/**
 * POST /stores/:id/logo — logo da loja (D1, todos os planos). Multipart, campo `logo`, imagem até 5 MB
 * (middleware/upload). Grava `logoUrl` e devolve `{ logoUrl }`.
 */
export const uploadStoreLogo = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: String(req.params.id) }, select: { id: true, ownerId: true } });
    if (!store) throw new AppError('Loja não encontrada', 404, true, 'STORE_NOT_FOUND');
    if (String(store.ownerId) !== String(req.user?.id ?? '')) {
      throw new AppError('Sem permissão para esta loja', 403, true, 'NOT_STORE_OWNER');
    }
    const file = (req as any).file;
    if (!file) throw new AppError('Envie uma imagem para o logo', 400, true, 'NO_FILE');
    const sizeError = checkImageSpec(file.buffer, 'logo');
    if (sizeError) return res.status(422).json({ error: sizeError, code: 'IMAGE_SIZE_INVALID' });

    const logoUrl = await uploadToCloudinary(file.buffer, 'drop/logos');
    await prisma.store.update({ where: { id: store.id }, data: { logoUrl } });
    logger.info('Logo da loja atualizado', { storeId: store.id });
    return res.json({ success: true, data: { logoUrl } });
  } catch (err) {
    return next(err);
  }
};

// [Plan1] Retorna lojas em destaque (Plano 3 com featuredBannerUrl preenchido)
export const getFeaturedStores = async (_req: Request, res: Response) => {
  try {
    logger.debug('[Plan1] getFeaturedStores — buscando lojas Plano 3 com banner de destaque');
    // `{ $exists: true, $ne: '' }` vira "não nulo e diferente de vazio" no Prisma.
    const featuredFilter: any = {
      plan: 3,
      featuredBannerUrl: { not: null },
      NOT: { featuredBannerUrl: '' },
    };
    if (process.env.KYC_ENFORCED === 'true') featuredFilter.isVerified = true; // ✅ GATE KYC Fase 2
    const billingWhere = await publicStoreBillingWhere(); // modo direto: some a loja pausada
    if (billingWhere) featuredFilter.AND = [billingWhere];

    const rows = await prisma.store.findMany({
      where: featuredFilter,
      select: { id: true, name: true, featuredBannerUrl: true, coverBannerUrl: true, plan: true, isOpen: true, city: true, neighborhood: true },
    });
    // O banner pode ter subido antes da aprovação: confere a assinatura (sem assinatura = legado, segue).
    const subs = await prisma.storeSubscription.findMany({
      where: { storeId: { in: rows.map((r) => r.id) } },
      select: { storeId: true, currentPlan: true },
    });
    const planBySub = new Map(subs.map((s) => [s.storeId, s.currentPlan]));
    const stores = rows
      .filter((st) => !planBySub.has(st.id) || planBySub.get(st.id) === 'plan3')
      .map((st) => ({ ...st, _id: st.id }));
    return res.json(stores);
  } catch (err) {
    logger.error('[getFeaturedStores] erro ao buscar lojas em destaque', err as Error);
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

    // Modo direto: loja pausada/cancelada pela mensalidade está fora do ar → sem top produtos.
    if (await isStoreHiddenByBilling(store.id)) return res.json({ products: [] });

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
      (await prisma.product.findMany({ where: { id: { in: grouped.map((g) => g.productId) }, ...ACTIVE_PRODUCT_WHERE } }))
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

const BILLABLE_STATUSES: any[] = ['pago', 'aguardando_motoboy', 'enviado', 'entregue'];
const TOP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Público — lojas mais vendedoras (últimos 30 dias). Ordena por nº de pedidos.
export const getTopStores = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const start = new Date(Date.now() - TOP_WINDOW_MS);
    const grouped = await prisma.order.groupBy({
      by: ['storeId'],
      where: { createdAt: { gte: start }, status: { in: BILLABLE_STATUSES } },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((g) => [g.storeId, g._count._all]));
    const filter: any = { id: { in: grouped.map((g) => g.storeId) } };
    if (process.env.KYC_ENFORCED === 'true') filter.isVerified = true;
    const billingWhere = await publicStoreBillingWhere(); // modo direto: some a loja pausada
    if (billingWhere) filter.AND = [billingWhere];
    const stores = await prisma.store.findMany({ where: filter });
    const out = stores
      .map((s) => ({ ...toPublicStore(s), salesCount: counts.get(s.id) ?? 0 }))
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, limit);
    return res.json(out);
  } catch (err) {
    console.error('[getTopStores] error:', err);
    return res.status(500).json({ error: 'Failed to list top stores' });
  }
};

// Público — produtos mais vendidos (últimos 30 dias). Traz storePlan p/ o front
// saber quais são de loja premium.
export const getTopProducts = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const start = new Date(Date.now() - TOP_WINDOW_MS);
    const grouped = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: { createdAt: { gte: start }, status: { in: BILLABLE_STATUSES } } },
      _sum: { quantity: true },
    });
    const sold = new Map(grouped.map((g) => [g.productId, g._sum.quantity ?? 0]));
    const products = await prisma.product.findMany({ where: { id: { in: grouped.map((g) => g.productId) }, ...ACTIVE_PRODUCT_WHERE } });
    const storeIds = [...new Set(products.map((p) => p.storeId))];
    // Modo direto: produto de loja pausada/cancelada pela mensalidade não aparece.
    const billingWhere = await publicStoreBillingWhere();
    const storeWhere: Prisma.StoreWhereInput = { id: { in: storeIds }, ...(billingWhere ? { AND: [billingWhere] } : {}) };
    const stores = await prisma.store.findMany({ where: storeWhere, select: { id: true, name: true, plan: true } });
    const storeMap = new Map(stores.map((s) => [s.id, s]));
    const out = products
      .filter((p: any) => storeMap.has(p.storeId))
      .map((p: any) => {
        const st = storeMap.get(p.storeId) as any;
        return {
          _id: p.id, name: p.name, image: p.image, price: Number(p.price), quantity: p.quantity,
          storeId: p.storeId, storeName: st?.name, storePlan: Number(st?.plan) || 1,
          soldCount: sold.get(p.id) ?? 0,
        };
      })
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, limit);
    return res.json(out);
  } catch (err) {
    console.error('[getTopProducts] error:', err);
    return res.status(500).json({ error: 'Failed to list top products' });
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
    // Modo direto: loja pausada/cancelada pela mensalidade nao aparece, mas o link/QR dela
    // ganha uma resposta propria (a tela "Loja indisponivel"), sem dizer o motivo.
    const billingWhere = await publicStoreBillingWhere();
    if (billingWhere && (await prisma.store.count({ where: { id: store.id, AND: [billingWhere] } })) === 0) {
      return res.status(404).json({
        error: 'Store not found',
        code: 'STORE_UNAVAILABLE',
        store: { _id: store.id, id: store.id, name: store.name, neighborhood: store.neighborhood ?? null, city: store.city ?? null },
      });
    }
    const [rated] = await withStoreRatings([toPublicStore(store)]);
    // D1: aberta agora = toggle + pausa + horário (mesmas regras da vitrine e do checkout).
    const publicCoupons = await findPublicCouponsForStore(store.id);
    return res.json({ ...rated, isOpenNow: isStoreOpenWithHoursNow(store), publicCoupons });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to get store' });
  }
};
