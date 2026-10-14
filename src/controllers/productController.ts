import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { emitStockChanged, applyStockOp } from '../services/storeIntegration';

import {
  emitProductCreated,
  emitProductUpdated,
  emitProductDeleted,
} from '../utils/socketEmitter';
import { uploadToCloudinary, uploadVideoToCloudinary } from '../utils/cloudinary';
import logger from '../config/logger';
import { publicStoreBillingWhere, isStoreHiddenByBilling } from '../services/saasBilling/gate';
import { AppError } from '../utils/AppError';
import { isStoreOwner } from '../utils/storeOwnership';
import type { BulkStockInput } from '../validation/productSchemas';
import { ACTIVE_PRODUCT_WHERE } from '../services/catalog/activeProduct';

// Prisma serializa Decimal (price) como string; o front espera number.
// Converte na fronteira de saída da API. Mantém _id para compatibilidade.
export const toApiProduct = (p: any) => {
  // Remove a RELAÇÃO `category` ({ name }) do payload — ela é um objeto e
  // quebrava o front que renderiza `product.category` como texto (React #31).
  // O nome vai em `categoryName`; o `categoryId` (string) continua no `...rest`.
  const { category, ...rest } = p || {};
  return {
    ...rest,
    _id: p?.id,
    price: p?.price != null ? Number(p.price) : p?.price,
    oldPrice: p?.oldPrice != null ? Number(p.oldPrice) : p?.oldPrice,
    categoryName: category?.name ?? undefined,
  };
};

/** "12,90" / "12.90" / "" → number | null (preço antigo é opcional). */
const parseOptionalPrice = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return isFinite(n) && n > 0 ? n : null;
};

export const createProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, name, price, oldPrice, quantity, category, subCategory, tags, description } = req.body;

    // Validação básica
    if (!storeId || !name || !price) {
      return res.status(400).json({ error: 'storeId, name, and price são obrigatórios' });
    }

    // verify store ownership: only store owner (lojista) can create product
    const store = await prisma.store.findUnique({ where: { id: String(storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || String(store.ownerId) !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    // Upload de múltiplas imagens
    const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const imageFiles = filesMap?.['images'] || (req.file ? [req.file] : []);
    const videoFiles = filesMap?.['video'] || [];

    let imagePath: string | undefined;
    const imageUrls: string[] = [];

    for (const imgFile of imageFiles) {
      try {
        const url = await uploadToCloudinary(imgFile.buffer, 'drop/products');
        imageUrls.push(url);
        if (!imagePath) imagePath = url; // primeira imagem fica como imagem principal
      } catch (uploadErr) {
        console.error('[createProduct] Cloudinary upload falhou:', uploadErr);
        return res.status(500).json({ error: 'Falha ao fazer upload de imagem' });
      }
    }

    let videoUrl: string | undefined;
    if (videoFiles.length > 0) {
      try {
        videoUrl = await uploadVideoToCloudinary(videoFiles[0].buffer, 'drop/products/videos');
      } catch (uploadErr) {
        console.error('[createProduct] Cloudinary video upload falhou:', uploadErr);
        return res.status(500).json({ error: 'Falha ao fazer upload do vídeo' });
      }
    }

    const product = await prisma.product.create({
      data: {
        storeId: String(storeId), name, description,
        price: Number(price), oldPrice: parseOptionalPrice(oldPrice),
        quantity: Number(quantity) || 0,
        categoryId: category || undefined, subCategory, tags,
        image: imagePath,
        images: imageUrls,
        video: videoUrl,
      },
    });
    
    // Emit socket event (com error handling)
    try {
      emitProductCreated(product);
    } catch (socketErr) {
      console.error('[createProduct] Socket emit error:', socketErr);
      // Não falha a requisição se socket falhar
    }
    
    logger.debug(`[createProduct] Produto criado: ${product.id} (${name})`);
    return res.status(201).json(toApiProduct(product));
  } catch (err: any) {
    console.error('[createProduct] Erro:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/** Teto de ids por GET /products?ids= (conferência da sacola; o pedido aceita até 50 itens). */
export const MAX_IDS_PER_LOOKUP = 50;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** "a,b,c" → ids únicos e válidos; null se vazio, malformado ou acima do teto. */
const parseIdsParam = (raw: unknown): string[] | null => {
  if (typeof raw !== 'string') return null;
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_IDS_PER_LOOKUP || !ids.every((id) => ID_RE.test(id))) return null;
  return ids;
};

export const listProducts = async (req: Request<any, any, any, { category?: string; storeId?: string; page?: string; limit?: string; ids?: string }>, res: Response) => {
  try {
    const { category, storeId } = req.query;
    // Conferência da sacola em lote (`?ids=a,b,c`): devolve só esses produtos, com os MESMOS gates
    // da vitrine abaixo. Id ausente, pausado ou de loja oculta simplesmente não volta.
    const lookupIds = req.query.ids !== undefined ? parseIdsParam(req.query.ids) : undefined;
    if (lookupIds === null) {
      return res.status(400).json({ error: `Informe de 1 a ${MAX_IDS_PER_LOOKUP} ids válidos, separados por vírgula.`, code: 'INVALID_IDS' });
    }
    // Cada restrição entra como um termo do AND — nenhuma sobrescreve a outra
    // (o filtro por loja não pode furar o gate de KYC nem o da mensalidade).
    // D1: produto pausado pelo lojista nunca entra na vitrine (o dono vê pelo /stores/dashboard).
    const and: any[] = [ACTIVE_PRODUCT_WHERE];
    // `category` na query é o id da Category (Product só tem `categoryId`; filtrar pela
    // relação `category` com uma string fazia o Prisma lançar → 500).
    if (category) and.push({ categoryId: String(category) });
    if (storeId) and.push({ storeId: String(storeId) });
    if (lookupIds) and.push({ id: { in: lookupIds } });

    // ✅ GATE KYC Fase 2: com KYC_ENFORCED, só produtos de lojas verificadas
    if (process.env.KYC_ENFORCED === 'true') {
      const verifiedStores = await prisma.store.findMany({ where: { isVerified: true }, select: { id: true } });
      and.push({ storeId: { in: verifiedStores.map((st) => st.id) } });
    }

    // Modo direto: produtos de loja pausada/cancelada pela mensalidade somem da vitrine.
    const billingWhere = await publicStoreBillingWhere();
    if (billingWhere) and.push({ store: billingWhere });
    const filter: any = and.length ? { AND: and } : {};

    if (lookupIds) {
      const rows = await prisma.product.findMany({ where: filter, include: { category: { select: { name: true } } } });
      return res.json({ products: rows.map(toApiProduct) });
    }

    // ✅ SEGURANÇA: Paginação
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const rows = await prisma.product.findMany({
      where: filter, skip, take: limit,
      // Ordem estável: sem ela a paginação devolve itens repetidos/pulados entre páginas.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { category: { select: { name: true } } },
    });
    const products = rows.map(toApiProduct);

    const total = await prisma.product.count({ where: filter });

    return res.json({
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to list products' });
  }
};

export const getProduct = async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    // Fora do ar para o público (link direto incluso), exceto para o próprio dono, que gerencia o catálogo:
    // produto pausado pelo lojista (D1) ou loja pausada/cancelada pela mensalidade (modo direto).
    if (!product.isActive || (await isStoreHiddenByBilling(String(product.storeId)))) {
      const owner = req.user?.id
        ? await prisma.store.count({ where: { id: String(product.storeId), ownerId: String(req.user.id) } })
        : 0;
      if (!owner) return res.status(404).json({ error: 'Product not found' });
    }
    return res.json(toApiProduct(product));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to get product' });
  }
};

export const updateProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price, oldPrice, quantity, category, subCategory, tags, keepImages, removeVideo } = req.body;

    const productDoc: any = await prisma.product.findUnique({ where: { id } });
    if (!productDoc) return res.status(404).json({ error: 'Product not found' });

    // check ownership
    const store = await prisma.store.findUnique({ where: { id: String(productDoc.storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    // Campos a atualizar (Prisma update; era mutação + productDoc.save() do Mongoose)
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = Number(price);
    if (oldPrice !== undefined) data.oldPrice = parseOptionalPrice(oldPrice); // vazio → null (remove desconto)
    if (quantity !== undefined) data.quantity = Number(quantity);
    if (category !== undefined) data.categoryId = category || null; // campo real é categoryId
    if (subCategory !== undefined) data.subCategory = subCategory;
    if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : [];

    // Upload de novas imagens
    const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const newImageFiles = filesMap?.['images'] || [];
    const newVideoFiles = filesMap?.['video'] || [];

    // keepImages: array de URLs existentes que devem ser mantidas
    let existingImages: string[] = [];
    if (keepImages) {
      existingImages = Array.isArray(keepImages) ? keepImages : [keepImages];
    }

    const uploadedImageUrls: string[] = [];
    for (const imgFile of newImageFiles) {
      try {
        const url = await uploadToCloudinary(imgFile.buffer, 'drop/products');
        uploadedImageUrls.push(url);
      } catch (uploadErr) {
        console.error('[updateProduct] Cloudinary upload falhou:', uploadErr);
        return res.status(500).json({ error: 'Falha ao fazer upload de imagem' });
      }
    }

    const allImages = [...existingImages, ...uploadedImageUrls];
    if (newImageFiles.length > 0 || keepImages !== undefined) {
      data.images = allImages;
      data.image = allImages[0] || productDoc.image;
    }

    // Vídeo
    if (removeVideo === 'true' || removeVideo === true) {
      data.video = null;
    } else if (newVideoFiles.length > 0) {
      try {
        data.video = await uploadVideoToCloudinary(newVideoFiles[0].buffer, 'drop/products/videos');
      } catch (uploadErr) {
        console.error('[updateProduct] Cloudinary video upload falhou:', uploadErr);
        return res.status(500).json({ error: 'Falha ao fazer upload do vídeo' });
      }
    }

    const updated = await prisma.product.update({ where: { id }, data });

    // Emit socket event
    emitProductUpdated(toApiProduct(updated));

    logger.debug(`[updateProduct] Produto atualizado: ${updated.id}`);
    return res.json(toApiProduct(updated));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to update product' });
  }
};

export const deleteProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const productDoc: any = await prisma.product.findUnique({ where: { id } });
    if (!productDoc) return res.status(404).json({ error: 'Product not found' });

    const store = await prisma.store.findUnique({ where: { id: String(productDoc.storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    await prisma.product.delete({ where: { id } });

    // Emit socket event
    emitProductDeleted(id);
    
    return res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to delete product' });
  }
};

export const updateStock = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // product id
    const { quantity } = req.body;
    if (typeof quantity !== 'number') return res.status(400).json({ error: 'quantity must be a number' });
    const productDoc: any = await prisma.product.findUnique({ where: { id } });
    if (!productDoc) return res.status(404).json({ error: 'Product not found' });

    const store = await prisma.store.findUnique({ where: { id: String(productDoc.storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    const updated = await prisma.product.update({ where: { id }, data: { quantity } });
    void emitStockChanged(String(productDoc.storeId), [String(id)]); // webhook (best-effort)
    return res.json(toApiProduct(updated));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to update stock' });
  }
};

/**
 * PATCH /products/stock — repõe o estoque de vários produtos de uma vez (painel da loja).
 * Mesma operação atômica da integração (`applyStockOp`). Produto de outra loja é ignorado
 * (o where é sempre `{ id, storeId }`). Item repetido: vale o último.
 */
export const bulkUpdateStock = async (req: AuthenticatedRequest, res: Response) => {
  const { storeId, items } = req.body as BulkStockInput;
  if (!(await isStoreOwner(storeId, req.user?.id))) {
    throw new AppError('Sem permissão para esta loja', 403, true, 'FORBIDDEN');
  }
  const last = new Map<string, number>();
  for (const it of items) last.set(it.productId, it.stock);

  const changed: string[] = [];
  for (const [productId, stock] of last) {
    const q = await applyStockOp(storeId, productId, { set: stock });
    if (q !== null) changed.push(productId);
  }
  if (changed.length) void emitStockChanged(storeId, changed); // webhook (best-effort)
  return res.json({ success: true, data: { updated: changed.length } });
};

/**
 * PUT /products/:id/active — o dono pausa (false) ou reativa (true) o produto.
 * Pausado some de toda leitura pública e o checkout recusa com PRODUCT_PAUSED; o painel continua mostrando.
 * Sem socket: o painel recarrega a lista (regra do projeto: nada de broadcast novo).
 */
export const setProductActive = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body as { isActive: boolean };
    const product = await prisma.product.findUnique({ where: { id: String(id) }, select: { id: true, storeId: true } });
    if (!product) throw new AppError('Produto não encontrado', 404, true, 'PRODUCT_NOT_FOUND');
    const owns = await prisma.store.count({ where: { id: product.storeId, ownerId: String(req.user?.id ?? '') } });
    if (!owns) throw new AppError('Este produto não é da sua loja', 403, true, 'NOT_STORE_OWNER');

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { isActive },
      include: { category: { select: { name: true } } },
    });
    void emitStockChanged(String(product.storeId), [product.id]); // webhook do integrador (best-effort)
    logger.info('Produto pausado/reativado pelo dono', { productId: product.id, storeId: product.storeId, isActive });
    return res.json({ success: true, data: toApiProduct(updated) });
  } catch (err) {
    return next(err);
  }
};
