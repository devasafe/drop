import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY) {
  console.warn('⚠️ ENCRYPTION_KEY não está configurado. Dados sensíveis podem não ser criptografados.');
  console.warn('⚠️ Gere uma chave com: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
}

/**
 * Criptografa dados sensíveis
 */
export function encryptSensitiveData(data: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY não está configurado');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(data, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Formato: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Descriptografa dados sensíveis
 */
export function decryptSensitiveData(encryptedData: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY não está configurado');
  }

  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Formato de dados criptografados inválido');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  
  return decrypted;
}

/**
 * Função para gerar uma chave de encriptação segura
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
