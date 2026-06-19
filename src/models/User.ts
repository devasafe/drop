import { Schema, model, Document } from 'mongoose';

// ✅ NOVO: Hierarquia completa de roles
export type Role = 
  | 'ceo'
  | 'marketing'
  | 'gerente_geral'
  | 'gerente_clientes'
  | 'gerente_lojistas'
  | 'gerente_motoboys'
  | 'lojista'
  | 'cliente'
  | 'motoboy';

export interface IUserAddress {
  _id?: any;
  label?: string; // apelido: Casa, Trabalho, etc
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  latitude: string;
  longitude: string;
  isDefault?: boolean; // ✅ NOVO: Flag para marcar endereço padrão
}

export type UserStatus = 'active' | 'blocked' | 'inactive';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role?: Role; // Legacy - mantém compatibilidade
  roles: Role[]; // Novo - múltiplos roles
  activeRole: Role; // Qual role está ativo no momento
  status: UserStatus; // 'active' (padrao) | 'blocked' (nao loga, nao opera) | 'inactive'
  blockedAt?: Date;
  blockedBy?: string; // id do admin que bloqueou
  blockReason?: string;
  storeId?: string; // ✅ NOVO: Se for lojista, referência à sua loja
  permissions?: string[]; // ✅ NOVO: Cached permissions para performance
  telefone?: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
  sexo?: string;
  photo?: string;
  createdAt: Date;
  updatedAt: Date;
  addresses?: IUserAddress[];
  // ✅ REMOVIDO: mainAddress (agora é apenas uma flag isDefault em addresses)
  // ✅ NOVO: Dados bancários para saque (CRIPTOGRAFADOS)
  bankInfoEncrypted?: string; // Armazenado criptografado no DB
  bankInfo?: {
    banco: string;
    agencia: string;
    conta: string;
    cpfBanco: string;
    isConfigured: boolean;
  }; // Descriptografado em memória
  // ✅ NOVO: Plano de negócios (para lojas/lojistas)
  planId?: string;
  // ✅ NOVO: Verificação de identidade (KYC) — Fase 1 (cliente)
  verification?: {
    email: { status: 'pending' | 'verified'; verifiedAt?: Date };
    phone: { status: 'pending' | 'verified'; e164?: string; verifiedAt?: Date };
    document: {
      type?: 'cpf' | 'rg';
      status: 'none' | 'pending' | 'approved' | 'rejected';
      number?: string;
      frontUrl?: string;
      backUrl?: string;
      submittedAt?: Date;
      reviewedBy?: string;
      reviewedAt?: Date;
      rejectionReason?: string;
    };
    // Facial do dono (usado na verificação de loja/motoboy — Fases 2 e 3)
    facial?: {
      status: 'none' | 'pending' | 'approved' | 'rejected';
      selfieUrl?: string;
      submittedAt?: Date;
      reviewedBy?: string;
      reviewedAt?: Date;
      rejectionReason?: string;
    };
    // Dados de motoboy (Fase 3): CNH + placa + foto da placa (revisados juntos)
    courier?: {
      status: 'none' | 'pending' | 'approved' | 'rejected';
      cnhNumber?: string;
      cnhPhotoUrl?: string;
      plate?: string;
      platePhotoUrl?: string;
      submittedAt?: Date;
      reviewedBy?: string;
      reviewedAt?: Date;
      rejectionReason?: string;
    };
  };
  // ✅ Fase 1 (gateway): subconta Asaas para custódia/split. Uma por pessoa (CPF/CNPJ).
  asaas?: {
    customerId?: string;       // id do cliente Asaas (quando COMPRA — conta-mãe)
    accountId?: string;        // id da subconta no Asaas (quando RECEBE — motoboy)
    walletId?: string;         // walletId usado no split das cobranças
    apiKeyEncrypted?: string;  // chave da subconta (cifrada) — usada nos saques
    pixKey?: string;           // chave PIX de saque do recebedor
    pixKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
    status: 'none' | 'pending' | 'active' | 'error';
    lastError?: string;
  };
}


const AddressSchema = new Schema<IUserAddress>({
  label: { type: String },
  street: { type: String, required: true },
  number: { type: String, required: true },
  neighborhood: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  cep: { type: String, required: true },
  latitude: { type: String, required: true },
  longitude: { type: String, required: true },
  isDefault: { type: Boolean, default: false } // ✅ NOVO: Flag de endereço padrão
}, { _id: true });

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'] }, // Legacy - agora suporta todos os roles
  roles: {
    type: [String],
    enum: ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'],
    default: ['cliente']
  },
  activeRole: {
    type: String,
    enum: ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'],
    default: 'cliente'
  },
  status: {
    type: String,
    enum: ['active', 'blocked', 'inactive'],
    default: 'active',
    index: true,
  },
  blockedAt: { type: Date },
  blockedBy: { type: String },
  blockReason: { type: String },
  storeId: { type: String, index: true }, // ✅ NOVO: Referência à loja
  permissions: { type: [String], default: [] }, // ✅ NOVO: Cache de permissões
  telefone: { type: String },
  cpf: { type: String },
  rg: { type: String },
  dataNascimento: { type: String },
  sexo: { type: String },
  photo: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }, // ✅ NOVO
  addresses: { type: [AddressSchema], default: [] },
  // ✅ REMOVIDO: mainAddress (agora é apenas uma flag isDefault em addresses)
  // ✅ NOVO: Dados bancários para saque (configurado uma única vez)
  // ✅ SEGURANÇA: Dados bancários criptografados
  bankInfoEncrypted: {
    type: String, // Armazenado criptografado
    default: null
  },
  bankInfo: {
    type: {
      banco: { type: String },
      agencia: { type: String },
      conta: { type: String },
      cpfBanco: { type: String },
      isConfigured: { type: Boolean, default: false }
    },
    default: null,
    select: false // Nunca retorna por padrão, deve ser explicitamente solicitado
  },
  // ✅ NOVO: Plano de negócios (para lojas/lojistas)
  planId: {
    type: String,
    ref: 'PricingPlan',
    default: null
  },
  // ✅ NOVO: Verificação de identidade (KYC) — Fase 1 (cliente)
  verification: {
    type: {
      email: {
        status: { type: String, enum: ['pending', 'verified'], default: 'pending' },
        verifiedAt: { type: Date },
      },
      phone: {
        status: { type: String, enum: ['pending', 'verified'], default: 'pending' },
        e164: { type: String },
        verifiedAt: { type: Date },
      },
      document: {
        type: { type: String, enum: ['cpf', 'rg'] },
        status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
        number: { type: String },
        frontUrl: { type: String },
        backUrl: { type: String },
        submittedAt: { type: Date },
        reviewedBy: { type: String },
        reviewedAt: { type: Date },
        rejectionReason: { type: String },
      },
      facial: {
        status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
        selfieUrl: { type: String },
        submittedAt: { type: Date },
        reviewedBy: { type: String },
        reviewedAt: { type: Date },
        rejectionReason: { type: String },
      },
      courier: {
        status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
        cnhNumber: { type: String },
        cnhPhotoUrl: { type: String },
        plate: { type: String },
        platePhotoUrl: { type: String },
        submittedAt: { type: Date },
        reviewedBy: { type: String },
        reviewedAt: { type: Date },
        rejectionReason: { type: String },
      },
    },
    default: () => ({
      email: { status: 'pending' },
      phone: { status: 'pending' },
      document: { status: 'none' },
    }),
  },
  // ✅ Fase 1 (gateway): subconta Asaas
  asaas: {
    type: {
      customerId: { type: String }, // id do cliente Asaas (compras)
      accountId: { type: String },
      walletId: { type: String },
      apiKeyEncrypted: { type: String, select: false }, // segredo — nunca retorna por padrão
      pixKey: { type: String },
      pixKeyType: { type: String, enum: ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'] },
      status: { type: String, enum: ['none', 'pending', 'active', 'error'], default: 'none' },
      lastError: { type: String },
    },
    default: () => ({ status: 'none' }),
  },
});

// ✅ SEGURANÇA: Middlewares para criptografar/descriptografar bankInfo
UserSchema.pre('save', function(next) {
  const user = this as any;
  
  // Se bankInfo foi modificado, criptografar
  if (user.isModified('bankInfo') && user.bankInfo && user.bankInfo.isConfigured) {
    try {
      const { encryptSensitiveData } = require('../utils/encryption');
      user.bankInfoEncrypted = encryptSensitiveData(JSON.stringify(user.bankInfo));
      // Limpar o campo em plain text após criptografar
      user.bankInfo = null;
    } catch (err) {
      console.error('❌ Erro ao criptografar bankInfo:', err);
      return next(err as any);
    }
  }
  
  next();
});

// ✅ SEGURANÇA: Hook para descriptografar bankInfo quando solicitado
UserSchema.post(/^findOne/, function(doc) {
  const user = doc as any;
  
  if (user && user.bankInfoEncrypted && !user.bankInfo) {
    try {
      const { decryptSensitiveData } = require('../utils/encryption');
      user.bankInfo = JSON.parse(decryptSensitiveData(user.bankInfoEncrypted));
    } catch (err) {
      console.error('❌ Erro ao descriptografar bankInfo:', err);
      // Retorna null em vez de lançar erro
      user.bankInfo = null;
    }
  }
});

// ✅ Índices para performance das queries de analytics
UserSchema.index({ createdAt: -1 });
UserSchema.index({ activeRole: 1, createdAt: -1 });

export default model<IUser>('User', UserSchema);
