import crypto from 'crypto';

// .trim() remove espaços/quebras acidentais ao colar a chave no painel (Render, etc.)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY?.trim();
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY) {
  console.warn('⚠️ ENCRYPTION_KEY não está configurado. Dados sensíveis podem não ser criptografados.');
  console.warn('⚠️ Gere uma chave com: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
}

/**
 * Retorna a chave como Buffer de 32 bytes, validando o formato com erro CLARO.
 * AES-256 exige 32 bytes = 64 caracteres hexadecimais.
 */
function getKeyBuffer(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY não está configurado');
  }
  const buf = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY inválida: precisa ter 64 caracteres hexadecimais (32 bytes). ` +
      `Recebido: ${ENCRYPTION_KEY.length} caracteres = ${buf.length} bytes. ` +
      `Verifique se não há aspas/espaços e se é só 0-9 e a-f.`
    );
  }
  return buf;
}

/**
 * Criptografa dados sensíveis
 */
export function encryptSensitiveData(data: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);
  
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
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Formato de dados criptografados inválido');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), iv);
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
