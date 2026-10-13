import { maskCredentials } from './safeErrorText';

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

/**
 * Erro de upload do Cloudinary como `Error` de verdade (o SDK rejeita com objeto simples
 * `{ message, http_code }`), com a mensagem sem credenciais: o 401 do Cloudinary ecoa a
 * api_key ("Invalid api_key 7219…").
 */
export class CloudinaryUploadError extends Error {
  status?: number;
  constructor(cause: any, fallback: string) {
    super(maskCredentials(cause?.message || fallback));
    this.name = 'CloudinaryUploadError';
    if (typeof cause?.http_code === 'number') this.status = cause.http_code;
  }
}

function uploadBuffer(buffer: Buffer, folder: string, resourceType: 'image' | 'video'): Promise<string> {
  const fallback = resourceType === 'video' ? 'Video upload failed' : 'Upload failed';
  return new Promise((resolve, reject) => {
    // disable_promises: sem isso o SDK cria uma promessa interna (Q) que, no upload_stream,
    // nunca é devolvida a ninguém; num erro do Cloudinary ela rejeita sem tratamento →
    // unhandledRejection. O resultado chega só pelo callback.
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, disable_promises: true },
      (error: any, result: any) => {
        if (error || !result) return reject(new CloudinaryUploadError(error, fallback));
        resolve(result.secure_url);
      }
    );
    stream.on('error', (err: any) => reject(new CloudinaryUploadError(err, fallback)));
    stream.end(buffer);
  });
}

export function uploadToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return uploadBuffer(buffer, folder, 'image');
}

export function uploadVideoToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return uploadBuffer(buffer, folder, 'video');
}
