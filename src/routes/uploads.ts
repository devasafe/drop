import { Router } from 'express';
import multer from 'multer';
import Product from '../models/Product';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { uploadToCloudinary } from '../utils/cloudinary';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/product/:id', authenticate, authorizeRoles('lojista'), upload.single('image'), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const Store = (await import('../models/Store')).default;
    const store = await Store.findById(product.storeId.toString());
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (store.ownerId.toString() !== req.user?.id) return res.status(403).json({ error: 'Forbidden' });

    product.image = await uploadToCloudinary(file.buffer, 'drop/products');
    await product.save();
    return res.json(product);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
