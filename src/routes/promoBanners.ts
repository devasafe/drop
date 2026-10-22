import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import {
  listActiveBanners,
  listAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  uploadBannerImage,
} from '../controllers/promoBannerController';

const router = Router();
// Avisos da home (22/10): banner:manage, delegável em Permissões; o CEO passa por '*'.
const manageBanners = authorizePermission('banner:manage');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Público: banners ativos p/ o carrossel da home.
router.get('/', listActiveBanners);

// Admin (banner:manage): gestão dos avisos.
router.get('/all', authenticate, manageBanners, listAllBanners);
router.post('/', authenticate, manageBanners, createBanner);
router.post('/upload', authenticate, manageBanners, upload.single('image'), uploadBannerImage);
router.patch('/:id', authenticate, manageBanners, updateBanner);
router.delete('/:id', authenticate, manageBanners, deleteBanner);

export default router;
