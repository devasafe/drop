// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudinaryLib = require('cloudinary');
const cloudinary = cloudinaryLib.v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Organização das fotos de verificação no Cloudinary:
//   drop/documentos/{clientes|motoboys|lojas}/{id}[/sub]
// Facilita achar tudo de um usuário/loja num lugar só (ex.: pedido judicial).
export type KycBucket = 'clientes' | 'motoboys' | 'lojas';

export function bucketForRole(role?: string): KycBucket {
  if (role === 'motoboy') return 'motoboys';
  if (role === 'lojista' || role === 'seller') return 'lojas';
  return 'clientes';
}

export function kycFolder(bucket: KycBucket, id: string, sub?: string): string {
  return `drop/documentos/${bucket}/${id}${sub ? `/${sub}` : ''}`;
}

export function uploadToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error: any, result: any) => {
        if (error || !result) return reject(error || new Error('Upload failed'));
        resolve(result.secure_url);
      }
    ).end(buffer);
  });
}

export function uploadVideoToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder, resource_type: 'video' },
      (error: any, result: any) => {
        if (error || !result) return reject(error || new Error('Video upload failed'));
        resolve(result.secure_url);
      }
    ).end(buffer);
  });
}
