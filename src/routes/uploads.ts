import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
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

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const store = await prisma.store.findUnique({ where: { id: String(product.storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (String(store.ownerId) !== req.user?.id) return res.status(403).json({ error: 'Forbidden' });

    const image = await uploadToCloudinary(file.buffer, 'drop/products');
    const updated = await prisma.product.update({ where: { id }, data: { image } });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
