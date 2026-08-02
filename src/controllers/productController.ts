import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

import {
  emitProductCreated,
  emitProductUpdated,
  emitProductDeleted,
} from '../utils/socketEmitter';
import { uploadToCloudinary, uploadVideoToCloudinary } from '../utils/cloudinary';

// Prisma serializa Decimal (price) como string; o front espera number.
// Converte na fronteira de saída da API. Mantém _id para compatibilidade.
const toApiProduct = (p: any) => ({
  ...p,
  _id: p?.id,
  price: p?.price != null ? Number(p.price) : p?.price,
  oldPrice: p?.oldPrice != null ? Number(p.oldPrice) : p?.oldPrice,
  // Nome legível da categoria (quando a relação foi incluída) — o front mostra
  // isso nos filtros em vez do categoryId (cuid).
  categoryName: p?.category?.name ?? undefined,
});

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
    
    console.log(`[createProduct] Produto criado: ${product.id} (${name})`);
    return res.status(201).json(toApiProduct(product));
  } catch (err: any) {
    console.error('[createProduct] Erro:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const listProducts = async (req: Request<any, any, any, { category?: string; page?: string; limit?: string }>, res: Response) => {
  try {
    const { category } = req.query;
    const filter: any = {};
    if (category) filter.category = category;

    // ✅ GATE KYC Fase 2: com KYC_ENFORCED, só produtos de lojas verificadas
    if (process.env.KYC_ENFORCED === 'true') {
      const verifiedStores = await prisma.store.findMany({ where: { isVerified: true }, select: { id: true } });
      filter.storeId = { in: verifiedStores.map((st) => st.id) };
    }

    // ✅ SEGURANÇA: Paginação
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const rows = await prisma.product.findMany({
      where: filter, skip, take: limit,
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

export const getProduct = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
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

    console.log(`[updateProduct] Produto atualizado: ${updated.id}`);
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
    return res.json(toApiProduct(updated));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to update stock' });
  }
};
