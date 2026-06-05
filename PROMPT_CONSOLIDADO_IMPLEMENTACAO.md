# 🚀 PROMPT CONSOLIDADO: SISTEMA DE HIERARQUIA + CARTEIRAS

**Objetivo**: Implementar sistema completo de roles + wallets com distribuição financeira automática  
**Data**: 28/02/2026  
**Status**: Ready to Code

---

## 📋 VISÃO GERAL DO SISTEMA

```
┌─────────────────────────────────────────────────────┐
│           SISTEMA DE HIERARQUIA + WALLETS           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ROLES (8 níveis)                                  │
│  ├─ CEO (você)                                     │
│  ├─ Marketing                                      │
│  ├─ Gerente Geral                                  │
│  ├─ Gerente Clientes / Lojistas / Motoboys        │
│  ├─ Lojista                                        │
│  ├─ Cliente                                        │
│  └─ Motoboy                                        │
│                                                     │
│  WALLETS (para cada tipo de usuário)               │
│  ├─ Cliente: Saldo para gastar                    │
│  ├─ Loja: Caixa da loja                           │
│  ├─ Motoboy: Renda de entregas                    │
│  └─ CEO: Caixa master da plataforma               │
│                                                     │
│  PLANOS (taxa de loja)                             │
│  ├─ Plano 1: 15% (Marketplace only)               │
│  ├─ Plano 2: 20% (Marketplace + Motoboys)         │
│  └─ Plano 3: 30% (Premium)                        │
│                                                     │
│  DISTRIBUIÇÃO (imediata ao pagar)                  │
│  └─ Cliente -R$100 → Loja +R$80 → CEO +R$20      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 TAREFAS ESPECÍFICAS

### TASK 1: Atualizar Models

**Arquivo**: `src/models/User.ts`

Adicionar campo `role` e `plan` (para lojista):

```typescript
// ADICIONAR NO SCHEMA USER:
role: {
  type: String,
  enum: ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'],
  default: 'cliente'
},
storeId?: ObjectId,  // Se for lojista, referência à sua loja
permissions?: [String],  // Cached permissions para performance
updatedAt: Date
```

---

**Arquivo**: `src/models/Store.ts`

Adicionar campo `plan`:

```typescript
// ADICIONAR NO SCHEMA STORE:
plan: {
  type: Number,
  enum: [1, 2, 3],
  default: 1,  // Plano 1 é default (15%)
},
planSince: Date,
planExpiresAt?: Date,
customCommissionRate?: Number,  // Para casos especiais (tipo: startup de amigo)
```

---

**Criar arquivo**: `src/models/Wallet.ts`

```typescript
import { Schema, model, Document } from 'mongoose';

export interface IWallet extends Document {
  owner: string;                           // userId ou storeId
  ownerType: 'user' | 'store' | 'platform';
  
  // Saldos
  balance: number;                         // Saldo disponível
  totalIncome: number;                     // Total que entrou
  totalSpent: number;                      // Total que saiu
  
  // Para lojistas: dados de taxa
  platformFeeRate?: number;               // % de taxa (15, 20, 30)
  
  // Para motoboys: benefícios gamificação
  gamificationBenefits?: {
    freeDeliveriesAvailable: number;
    discountPercentage: number;
    lastRedeemedAt?: Date;
  };
  
  // Histórico transacional
  history: Array<{
    date: Date;
    type: 'credit' | 'debit';
    amount: number;
    reason: string;
    relatedId?: string;                  // orderId, deliveryId, etc
    reference?: string;
  }>;
  
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>({
  owner: { type: String, required: true, index: true },
  ownerType: {
    type: String,
    enum: ['user', 'store', 'platform'],
    required: true,
    index: true
  },
  
  balance: { type: Number, default: 0, min: 0 },
  totalIncome: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  
  platformFeeRate: { type: Number },
  
  gamificationBenefits: {
    freeDeliveriesAvailable: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    lastRedeemedAt: Date
  },
  
  history: [
    {
      date: { type: Date, default: Date.now },
      type: { type: String, enum: ['credit', 'debit'], required: true },
      amount: { type: Number, required: true },
      reason: { type: String, required: true },
      relatedId: String,
      reference: String
    }
  ],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices para performance
walletSchema.index({ owner: 1, ownerType: 1 }, { unique: true });
walletSchema.index({ 'history.date': -1 });

export default model<IWallet>('Wallet', walletSchema);
```

---

### TASK 2: Criar Funções Utilitárias

**Criar arquivo**: `src/utils/walletCalculations.ts`

```typescript
import Store from '../models/Store';

/**
 * Busca a taxa da loja conforme seu plano
 * Plano 1: 15%
 * Plano 2: 20%
 * Plano 3: 30%
 */
export async function getStorePlanFee(storeId: string): Promise<number> {
  const store = await Store.findById(storeId);
  
  if (!store) throw new Error('Loja não encontrada');
  
  // Se houver customFee (caso especial), usa ela
  if (store.customCommissionRate !== undefined) {
    return store.customCommissionRate;
  }
  
  // Senão usa a taxa do plano
  const planFees: { [key: number]: number } = {
    1: 15,
    2: 20,
    3: 30
  };
  
  return planFees[store.plan] || 15;
}

/**
 * Calcula quanto o motoboy ganha por uma entrega
 * Base: R$ 7.00
 * Adicional: R$ 1.00 por km
 * Bônus: R$ 1.00 (rating 3.5-4.4) ou R$ 2.00 (rating >= 4.5)
 */
export function calculateMotoboyEarnings(
  distanceKm: number,
  rating?: number
): number {
  const baseValue = 7.0;
  const perKmValue = 1.0;
  const distanceEarning = distanceKm * perKmValue;
  
  let ratingBonus = 0;
  if (rating) {
    if (rating >= 4.5) {
      ratingBonus = 2.0;
    } else if (rating >= 3.5) {
      ratingBonus = 1.0;
    }
  }
  
  return baseValue + distanceEarning + ratingBonus;
}

/**
 * Calcula a distribuição de valores de um pedido
 * Retorna quanto cada um recebe
 */
export async function calculateOrderDistribution(
  orderTotal: number,
  storeId: string,
  distanceKm?: number,
  motoboyRating?: number
) {
  const storeFeePercent = await getStorePlanFee(storeId);
  const storeFeeDecimal = storeFeePercent / 100;
  
  const storeAmount = orderTotal * (1 - storeFeeDecimal);
  const ceoAmount = orderTotal * storeFeeDecimal;
  const motoboyAmount = calculateMotoboyEarnings(distanceKm || 0, motoboyRating);
  
  return {
    orderTotal,
    storeAmount,
    storeFeePrecent: storeFeePercent,
    ceoAmount,
    motoboyAmount,
    distribution: {
      store: storeAmount,
      ceo: ceoAmount,
      motoboy: motoboyAmount
    }
  };
}

/**
 * Retorna as permissões conforme o role
 */
export const rolePermissions: { [key: string]: string[] } = {
  ceo: ['*'],  // Tudo
  
  marketing: [
    'notification:create',
    'banner:manage',
    'theme:edit'
  ],
  
  gerente_geral: [
    'notification:create',
    'notification:approve',
    'notification:reject',
    'user:view_all',
    'store:view_all',
    'wallet:view_all',
    'dashboard:view_all'
  ],
  
  gerente_clientes: [
    'notification:create',
    'user:view_clients',
    'user:edit_clients',
    'wallet:view_clients',
    'dashboard:view_client_metrics'
  ],
  
  gerente_lojistas: [
    'notification:create',
    'store:view_all',
    'store:edit',
    'wallet:view_stores',
    'dashboard:view_store_metrics'
  ],
  
  gerente_motoboys: [
    'notification:create',
    'user:view_motoboys',
    'user:edit_motoboys',
    'wallet:view_motoboys',
    'dashboard:view_motoboy_metrics'
  ],
  
  lojista: [
    'store:view_own',
    'store:edit_own',
    'product:create_own',
    'product:edit_own',
    'product:delete_own',
    'order:view_own',
    'wallet:view_own'
  ],
  
  cliente: [
    'order:create',
    'order:view_own',
    'order:cancel_own',
    'wallet:view_own',
    'wallet:credit',
    'address:manage_own'
  ],
  
  motoboy: [
    'delivery:view_own',
    'delivery:accept',
    'delivery:complete',
    'wallet:view_own',
    'wallet:transfer',
    'gamification:redeem_benefit'
  ]
};

/**
 * Verifica se um usuário tem uma permissão específica
 */
export function hasPermission(userRole: string, permission: string): boolean {
  const permissions = rolePermissions[userRole] || [];
  
  // Se role tem '*', tem tudo
  if (permissions.includes('*')) return true;
  
  // Senão verifica permissão específica
  return permissions.includes(permission);
}
```

---

### TASK 3: Criar Schemas Zod

**Arquivo**: `src/validation/schemas.ts` (ADICIONAR ao final)

```typescript
// ============= WALLET SCHEMAS =============
export const CreditWalletSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo').max(100000, 'Máximo R$ 100.000'),
  paymentMethod: z.enum(['credit_card', 'pix', 'bank_transfer']),
  reference: z.string().optional()
});

export const TransferWalletSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo'),
  bankAccount: z.object({
    banco: z.string(),
    agencia: z.string(),
    conta: z.string(),
    cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos')
  }),
  reason: z.string().optional()
});

export const ApplyBenefitSchema = z.object({
  benefitType: z.enum(['free_delivery', 'discount']),
  amount: z.number().positive(),
  deliveryId: z.string().optional()
});

export type CreditWalletInput = z.infer<typeof CreditWalletSchema>;
export type TransferWalletInput = z.infer<typeof TransferWalletSchema>;
export type ApplyBenefitInput = z.infer<typeof ApplyBenefitSchema>;
```

---

### TASK 4: Criar Middleware de Permissões

**Arquivo**: `src/middleware/authorize.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../utils/walletCalculations';

/**
 * Middleware que verifica se usuário tem permissão específica
 * Uso: router.post('/orders', authorizePermission('order:create'), handler)
 */
export function authorizePermission(requiredPermission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    
    if (!hasPermission(user.role, requiredPermission)) {
      return res.status(403).json({
        error: `Permissão negada. Você precisa de: ${requiredPermission}`
      });
    }
    
    next();
  };
}

/**
 * Verifica se usuário é CEO
 */
export function authorizeCEO(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  
  if (!user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  
  if (user.role !== 'ceo') {
    return res.status(403).json({ error: 'Apenas CEO tem acesso' });
  }
  
  next();
}

/**
 * Verifica se usuário pode aprovar notificações
 */
export function authorizeNotificationApprover(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  
  if (!user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  
  const canApprove = ['ceo', 'gerente_geral'].includes(user.role);
  
  if (!canApprove) {
    return res.status(403).json({
      error: 'Apenas CEO ou Gerente Geral podem aprovar notificações'
    });
  }
  
  next();
}
```

---

### TASK 5: Criar Controller de Wallets

**Criar arquivo**: `src/controllers/walletController.ts`

```typescript
import { Request, Response } from 'express';
import Wallet from '../models/Wallet';
import User from '../models/User';
import Order from '../models/Order';
import Store from '../models/Store';
import {
  calculateOrderDistribution,
  getStorePlanFee,
  calculateMotoboyEarnings
} from '../utils/walletCalculations';

/**
 * GET /wallets/:userId
 * Consultar saldo de um usuário
 */
export const getWallet = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada' });
    }
    
    return res.json({
      owner: userId,
      balance: wallet.balance,
      totalIncome: wallet.totalIncome,
      totalSpent: wallet.totalSpent,
      history: wallet.history.slice(-10)  // Últimas 10 transações
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /wallets/store/:storeId
 * Consultar saldo da loja
 */
export const getStoreWallet = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const wallet = await Wallet.findOne({ owner: storeId, ownerType: 'store' });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Carteira da loja não encontrada' });
    }
    
    const store = await Store.findById(storeId);
    const plan = store?.plan || 1;
    const fee = (await getStorePlanFee(storeId)) / 100;
    
    return res.json({
      owner: storeId,
      plan,
      feePercent: (fee * 100),
      balance: wallet.balance,
      totalIncome: wallet.totalIncome,
      totalSpent: wallet.totalSpent,
      history: wallet.history.slice(-10)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /wallets/:userId/credit
 * Cliente adiciona saldo (carrega crédito)
 */
export const creditWallet = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { amount, paymentMethod, reference } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    
    let wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });
    
    if (!wallet) {
      // Cria carteira se não existir
      wallet = await Wallet.create({
        owner: userId,
        ownerType: 'user',
        balance: amount,
        totalIncome: amount,
        history: [
          {
            type: 'credit',
            amount,
            reason: `Carregamento de saldo via ${paymentMethod}`,
            date: new Date(),
            reference
          }
        ]
      });
    } else {
      // Atualiza carteira existente
      wallet.balance += amount;
      wallet.totalIncome += amount;
      wallet.history.push({
        type: 'credit',
        amount,
        reason: `Carregamento de saldo via ${paymentMethod}`,
        date: new Date(),
        reference
      });
      await wallet.save();
    }
    
    return res.json({
      success: true,
      newBalance: wallet.balance,
      transactionId: wallet._id
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /wallets/:userId/transfer
 * Motoboy ou Lojista saca para banco
 */
export const transferWallet = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { amount, bankAccount, reason } = req.body;
    
    const wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada' });
    }
    
    if (wallet.balance < amount) {
      return res.status(400).json({
        error: 'Saldo insuficiente',
        available: wallet.balance,
        requested: amount
      });
    }
    
    // Debita carteira
    wallet.balance -= amount;
    wallet.totalSpent += amount;
    wallet.history.push({
      type: 'debit',
      amount,
      reason: reason || `Transferência para banco (${bankAccount.banco})`,
      date: new Date(),
      reference: `TRF_${Date.now()}`
    });
    
    await wallet.save();
    
    // TODO: Integrar com sistema de transferência bancária
    
    return res.json({
      success: true,
      newBalance: wallet.balance,
      transferId: `TRF_${Date.now()}`,
      status: 'pending'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /wallets/:userId/history
 * Histórico de transações
 */
export const getWalletHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada' });
    }
    
    const history = wallet.history
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(Number(offset), Number(offset) + Number(limit));
    
    return res.json({
      total: wallet.history.length,
      limit: Number(limit),
      offset: Number(offset),
      history
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /wallets/platform/metrics
 * Métricas gerais da plataforma (CEO only)
 */
export const getPlatformMetrics = async (req: Request, res: Response) => {
  try {
    const platformWallet = await Wallet.findOne({
      owner: 'platform',
      ownerType: 'platform'
    });
    
    if (!platformWallet) {
      return res.status(404).json({ error: 'Carteira da plataforma não encontrada' });
    }
    
    return res.json({
      totalBalance: platformWallet.balance,
      totalIncome: platformWallet.totalIncome,
      totalSpent: platformWallet.totalSpent,
      history: platformWallet.history.slice(-20)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
```

---

### TASK 6: Criar Routes de Wallets

**Criar arquivo**: `src/routes/wallets.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getWallet,
  getStoreWallet,
  creditWallet,
  transferWallet,
  getWalletHistory,
  getPlatformMetrics
} from '../controllers/walletController';
import { authorizePermission, authorizeCEO } from '../middleware/authorize';

const router = Router();

// Carteira do usuário (cliente, motoboy, etc)
router.get('/:userId', authenticate, getWallet);
router.get('/:userId/history', authenticate, getWalletHistory);
router.post(
  '/:userId/credit',
  authenticate,
  authorizePermission('wallet:credit'),
  creditWallet
);
router.post(
  '/:userId/transfer',
  authenticate,
  authorizePermission('wallet:transfer'),
  transferWallet
);

// Carteira da loja
router.get('/store/:storeId', authenticate, getStoreWallet);

// Métricas da plataforma (CEO only)
router.get('/platform/metrics', authenticate, authorizeCEO, getPlatformMetrics);

export default router;
```

---

### TASK 7: Integrar Wallets ao Criar Pedido

**Arquivo**: `src/controllers/orderController.ts` (MODIFICAR função createOrder)

```typescript
async createOrder(req: Request, res: Response) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { storeId, products, deliveryDistanceKm, paymentMethod, latitude, longitude, idempotentKey } = req.body;
    const userId = (req as any).user.id;
    
    // Validar schema
    const validated = CreateOrderSchema.parse(req.body);
    
    // 1. Verificar idempotência
    let existingOrder = await Order.findOne({ idempotentKey });
    if (existingOrder) {
      await session.abortTransaction();
      return res.status(200).json(existingOrder);
    }
    
    // 2. Verificar estoque e calcular subtotal
    let subtotal = 0;
    for (const item of products) {
      const product = await Product.findById(item.productId).session(session);
      if (!product || product.quantity < item.quantity) {
        throw new Error(`Produto ${item.productId} sem estoque`);
      }
      subtotal += item.price * item.quantity;
    }
    
    // 3. Calcular taxa de entrega
    const deliveryFee = 7 + Math.max(0, deliveryDistanceKm) * 1;
    const orderTotal = subtotal + deliveryFee;
    
    // 4. Verificar saldo do cliente
    let clientWallet = await Wallet.findOne(
      { owner: userId, ownerType: 'user' }
    ).session(session);
    
    if (!clientWallet) {
      clientWallet = await Wallet.create(
        [{
          owner: userId,
          ownerType: 'user',
          balance: 0,
          totalIncome: 0,
          totalSpent: 0,
          history: []
        }],
        { session }
      );
      clientWallet = clientWallet[0];
    }
    
    if (clientWallet.balance < orderTotal) {
      throw new Error(
        `Saldo insuficiente. Seu saldo: R$ ${clientWallet.balance.toFixed(2)}. ` +
        `Necessário: R$ ${orderTotal.toFixed(2)}`
      );
    }
    
    // 5. DISTRIBUIR VALORES (imediato)
    const distribution = await calculateOrderDistribution(
      orderTotal,
      storeId,
      deliveryDistanceKm
    );
    
    // 5.1. Débito: Cliente
    clientWallet.balance -= orderTotal;
    clientWallet.totalSpent += orderTotal;
    clientWallet.history.push({
      date: new Date(),
      type: 'debit',
      amount: orderTotal,
      reason: 'Pedido criado',
      relatedId: storeId
    });
    await clientWallet.save({ session });
    
    // 5.2. Crédito: Loja
    let storeWallet = await Wallet.findOne(
      { owner: storeId, ownerType: 'store' }
    ).session(session);
    
    if (!storeWallet) {
      storeWallet = await Wallet.create(
        [{
          owner: storeId,
          ownerType: 'store',
          balance: distribution.storeAmount,
          totalIncome: distribution.storeAmount,
          totalSpent: 0,
          history: [{
            date: new Date(),
            type: 'credit',
            amount: distribution.storeAmount,
            reason: 'Venda',
            relatedId: storeId
          }]
        }],
        { session }
      );
    } else {
      storeWallet.balance += distribution.storeAmount;
      storeWallet.totalIncome += distribution.storeAmount;
      storeWallet.history.push({
        date: new Date(),
        type: 'credit',
        amount: distribution.storeAmount,
        reason: 'Venda',
        relatedId: storeId
      });
      await storeWallet.save({ session });
    }
    
    // 5.3. Crédito: CEO (plataforma)
    let ceoWallet = await Wallet.findOne(
      { owner: 'platform', ownerType: 'platform' }
    ).session(session);
    
    if (!ceoWallet) {
      ceoWallet = await Wallet.create(
        [{
          owner: 'platform',
          ownerType: 'platform',
          balance: distribution.ceoAmount,
          totalIncome: distribution.ceoAmount,
          totalSpent: 0,
          history: [{
            date: new Date(),
            type: 'credit',
            amount: distribution.ceoAmount,
            reason: 'Taxa plataforma',
            relatedId: storeId
          }]
        }],
        { session }
      );
    } else {
      ceoWallet.balance += distribution.ceoAmount;
      ceoWallet.totalIncome += distribution.ceoAmount;
      ceoWallet.history.push({
        date: new Date(),
        type: 'credit',
        amount: distribution.ceoAmount,
        reason: 'Taxa plataforma',
        relatedId: storeId
      });
      await ceoWallet.save({ session });
    }
    
    // 6. Decrementar estoque
    for (const item of products) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { quantity: -item.quantity } },
        { session }
      );
    }
    
    // 7. Criar pedido
    const order = await Order.create(
      [{
        userId,
        storeId,
        products,
        subtotal,
        deliveryFee,
        total: orderTotal,
        deliveryDistanceKm,
        paymentMethod: paymentMethod || 'pix',
        address,
        latitude,
        longitude,
        idempotentKey,
        status: 'criado',
        walletDistribution: {
          storeAmount: distribution.storeAmount,
          ceoAmount: distribution.ceoAmount,
          storeFeePercent: distribution.storeFeePrecent
        }
      }],
      { session }
    );
    
    // 8. Commit
    await session.commitTransaction();
    
    console.log('✅ Pedido criado com distribuição de carteiras');
    return res.status(201).json(order[0]);
    
  } catch (err: any) {
    await session.abortTransaction();
    console.error(err);
    
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validação falhou', details: err.errors });
    }
    
    return res.status(500).json({ error: err.message || 'Erro ao criar pedido' });
  } finally {
    await session.endSession();
  }
}
```

---

### TASK 8: Registrar Routes no app.ts

**Arquivo**: `src/app.ts` (ADICIONAR no arquivo)

```typescript
import walletRoutes from './routes/wallets';

// ... outras imports ...

// Registrar routes
app.use('/api/wallets', walletRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/auth', authRoutes);
// ... etc
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### Backend - Models
- [ ] Atualizar `src/models/User.ts` com campo `role`
- [ ] Atualizar `src/models/Store.ts` com campo `plan`
- [ ] Criar `src/models/Wallet.ts` com schema completo

### Backend - Utilitários
- [ ] Criar `src/utils/walletCalculations.ts` com:
  - `getStorePlanFee()`
  - `calculateMotoboyEarnings()`
  - `calculateOrderDistribution()`
  - `rolePermissions`
  - `hasPermission()`

### Backend - Validação
- [ ] Adicionar schemas Zod em `src/validation/schemas.ts`:
  - `CreditWalletSchema`
  - `TransferWalletSchema`
  - `ApplyBenefitSchema`

### Backend - Middleware
- [ ] Criar `src/middleware/authorize.ts` com:
  - `authorizePermission()`
  - `authorizeCEO()`
  - `authorizeNotificationApprover()`

### Backend - Controller
- [ ] Criar `src/controllers/walletController.ts` com:
  - `getWallet()`
  - `getStoreWallet()`
  - `creditWallet()`
  - `transferWallet()`
  - `getWalletHistory()`
  - `getPlatformMetrics()`

### Backend - Routes
- [ ] Criar `src/routes/wallets.ts`
- [ ] Registrar em `src/app.ts`

### Backend - Integração
- [ ] Modificar `createOrder()` em `orderController.ts` para:
  - Distribuir valores imediatamente
  - Usar transações
  - Validar saldo cliente

### Backend - Testes
- [ ] Testar distribuição Plano 1 (15%)
- [ ] Testar distribuição Plano 2 (20%)
- [ ] Testar distribuição Plano 3 (30%)
- [ ] Testar saldo insuficiente
- [ ] Testar transação com rollback
- [ ] Testar cálculo motoboy earnings

### Frontend (Próxima Fase)
- [ ] Página de Carteira (cliente)
- [ ] Formulário carregar saldo
- [ ] Histórico de transações
- [ ] Verificação de saldo no checkout

---

## 🧪 TESTES COM POSTMAN

```bash
# 1. Registrar cliente
POST /auth/register
{
  "name": "João Cliente",
  "email": "joao@example.com",
  "password": "Senha123@!",
  "role": "cliente"
}

# 2. Registrar lojista com plano 2
POST /auth/register
{
  "name": "Maria Lojista",
  "email": "maria@example.com",
  "password": "Senha123@!",
  "role": "lojista"
}

# Atualizaar loja com plano 2
PUT /stores/{storeId}
{
  "plan": 2
}

# 3. Login e pegar token
POST /auth/login
{
  "email": "joao@example.com",
  "password": "Senha123@!"
}

# 4. Carregar saldo na carteira do cliente
POST /wallets/{userId}/credit
Authorization: Bearer {token}
{
  "amount": 500.00,
  "paymentMethod": "pix",
  "reference": "Carregamento inicial"
}

# 5. Consultar saldo
GET /wallets/{userId}
Authorization: Bearer {token}

# 6. Criar pedido (com distribuição automática)
POST /orders
Authorization: Bearer {token}
{
  "storeId": "{storeId}",
  "products": [
    { "productId": "{productId}", "quantity": 2, "price": 100.00 }
  ],
  "deliveryDistanceKm": 8,
  "paymentMethod": "pix",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "idempotentKey": "uuid-here"
}

# 7. Verificar carteira da loja
GET /wallets/store/{storeId}
Authorization: Bearer {token}

# 8. Verificar carteira da plataforma (CEO)
GET /wallets/platform/metrics
Authorization: Bearer {ceoToken}
```

---

## 💡 NOTAS IMPORTANTES

1. **Transações**: Todas as operações de dinheiro usam `session.startTransaction()` do MongoDB
2. **Imediato**: Valores distribuem assim que pedido é criado, não espera confirmação
3. **Permissões**: Use `authorizePermission()` antes de handlers para checar acesso
4. **Histórico**: Cada transação fica registrada em `wallet.history`
5. **Rollback**: Se algo falhar, tudo volta (transação atomiza)

---

**Status**: ✅ Ready to implement  
**Criado em**: 28/02/2026  
**Versão**: 1.0
