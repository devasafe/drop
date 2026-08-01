import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorizeRoles } from '../middleware/auth';
import {
  listActiveBanners,
  listAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  uploadBannerImage,
} from '../controllers/promoBannerController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Público: banners ativos p/ o carrossel da home.
router.get('/', listActiveBanners);

// Admin (CEO): gestão dos avisos.
router.get('/all', authenticate, authorizeRoles('ceo'), listAllBanners);
router.post('/', authenticate, authorizeRoles('ceo'), createBanner);
router.post('/upload', authenticate, authorizeRoles('ceo'), upload.single('image'), uploadBannerImage);
router.patch('/:id', authenticate, authorizeRoles('ceo'), updateBanner);
router.delete('/:id', authenticate, authorizeRoles('ceo'), deleteBanner);

export default router;
