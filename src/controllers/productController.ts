import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import Product from '../models/Product';
import Store from '../models/Store';
import {
  emitProductCreated,
  emitProductUpdated,
  emitProductDeleted,
} from '../utils/socketEmitter';
import { uploadToCloudinary, uploadVideoToCloudinary } from '../utils/cloudinary';

export const createProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, name, price, quantity, category, subCategory, tags, description } = req.body;

    // Validação básica
    if (!storeId || !name || !price) {
      return res.status(400).json({ error: 'storeId, name, and price são obrigatórios' });
    }

    // verify store ownership: only store owner (lojista) can create product
    const store = await Store.findById(storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!req.user || store.ownerId.toString() !== req.user.id) {
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

    const product = new Product({
      storeId, name, description, price, quantity, category, subCategory, tags,
      image: imagePath,
      images: imageUrls,
      video: videoUrl
    });
    await product.save();
    
    // Emit socket event (com error handling)
    try {
      emitProductCreated(product.toObject());
    } catch (socketErr) {
      console.error('[createProduct] Socket emit error:', socketErr);
      // Não falha a requisição se socket falhar
    }
    
    console.log(`[createProduct] Produto criado: ${product._id} (${name})`);
    return res.status(201).json(product);
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
      const verifiedStores = await Store.find({ isVerified: true }).select('_id').lean();
      filter.storeId = { $in: verifiedStores.map((s: any) => s._id) };
    }

    // ✅ SEGURANÇA: Paginação
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const products = await Product.find(filter)
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await Product.countDocuments(filter);

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
    const product = await Product.findById(id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json(product);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to get product' });
  }
};

export const updateProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price, quantity, category, subCategory, tags, keepImages, removeVideo } = req.body;

    const productDoc = await Product.findById(id);
    if (!productDoc) return res.status(404).json({ error: 'Product not found' });

    // check ownership
    const store = await Store.findById(productDoc.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    // Campos básicos
    if (name !== undefined) productDoc.name = name;
    if (description !== undefined) productDoc.description = description;
    if (price !== undefined) productDoc.price = Number(price);
    if (quantity !== undefined) productDoc.quantity = Number(quantity);
    if (category !== undefined) productDoc.category = category || undefined;
    if (subCategory !== undefined) productDoc.subCategory = subCategory;
    if (tags !== undefined) productDoc.tags = Array.isArray(tags) ? tags : [];

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
      productDoc.images = allImages;
      productDoc.image = allImages[0] || productDoc.image;
    }

    // Vídeo
    if (removeVideo === 'true' || removeVideo === true) {
      productDoc.video = undefined;
    } else if (newVideoFiles.length > 0) {
      try {
        productDoc.video = await uploadVideoToCloudinary(newVideoFiles[0].buffer, 'drop/products/videos');
      } catch (uploadErr) {
        console.error('[updateProduct] Cloudinary video upload falhou:', uploadErr);
        return res.status(500).json({ error: 'Falha ao fazer upload do vídeo' });
      }
    }

    await productDoc.save();

    // Emit socket event
    emitProductUpdated(productDoc.toObject());

    console.log(`[updateProduct] Produto atualizado: ${productDoc._id}`);
    return res.json(productDoc.toObject());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to update product' });
  }
};

export const deleteProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const productDoc = await Product.findById(id);
    if (!productDoc) return res.status(404).json({ error: 'Product not found' });

    const store = await Store.findById(productDoc.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    await productDoc.deleteOne();
    
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
    const productDoc = await Product.findById(id);
    if (!productDoc) return res.status(404).json({ error: 'Product not found' });

    const store = await Store.findById(productDoc.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - not store owner' });
    }

    productDoc.quantity = quantity;
    await productDoc.save();
    return res.json(productDoc.toObject());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to update stock' });
  }
};
