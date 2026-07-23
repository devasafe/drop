import crypto from 'crypto';

// Gera um id hexadecimal de 24 chars (formato ObjectId) para usar como id "fake"
// em testes — substitui o antigo `new mongoose.Types.ObjectId()` sem depender do Mongoose.
export const fakeObjectId = (): string => crypto.randomBytes(12).toString('hex');
