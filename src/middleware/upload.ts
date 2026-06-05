import multer from 'multer';
import path from 'path';

const imageFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, GIF, WebP images are allowed'));
  }

  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return cb(new Error('File extension not allowed'));
  }

  const filename = path.basename(file.originalname);
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return cb(new Error('Invalid filename'));
  }

  cb(null, true);
};

const mediaFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'
  ];
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new Error('Tipo de arquivo não permitido. Use imagens (JPEG/PNG/WebP) ou vídeos (MP4/WebM)'));
  }

  const filename = path.basename(file.originalname);
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return cb(new Error('Invalid filename'));
  }

  cb(null, true);
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Upload de mídia de produto: imagens (5MB cada) + vídeo (200MB)
export const uploadProductMedia = multer({
  storage: multer.memoryStorage(),
  fileFilter: mediaFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB (para vídeos)
});

export default upload;
