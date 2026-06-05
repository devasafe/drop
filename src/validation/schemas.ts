import { z } from 'zod';

// ============= AUTH SCHEMAS =============
export const RegisterSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100),
  email: z.string().email('Email inválido'),
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
    .regex(/[@$!%*?&]/, 'Senha deve conter pelo menos um caractere especial'),
  role: z.enum(['cliente', 'lojista', 'motoboy']).optional().default('cliente'),
  telefone: z.string().min(10).optional(),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos').optional(),
  rg: z.string().optional(),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em formato YYYY-MM-DD').optional(),
  sexo: z.enum(['M', 'F']).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

// ============= PRODUCT SCHEMAS =============
export const CreateProductSchema = z.object({
  storeId: z.string().regex(/^[0-9a-f]{24}$/i, 'ID da loja inválido'),
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(200),
  price: z.number().positive('Preço deve ser positivo'),
  quantity: z.number().int().nonnegative('Quantidade não pode ser negativa').default(0),
  category: z.string().min(2).optional(),
  subCategory: z.string().min(2).optional(),
  tags: z.array(z.string()).optional(),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  price: z.number().positive().optional(),
  quantity: z.number().int().nonnegative().optional(),
  category: z.string().min(2).optional(),
  subCategory: z.string().min(2).optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

// ============= ORDER SCHEMAS =============
export const OrderProductSchema = z.object({
  productId: z.string().regex(/^[0-9a-f]{24}$/i, 'ID do produto inválido'),
  quantity: z.number().int().positive('Quantidade deve ser maior que 0').max(99, 'Quantidade máxima é 99'),
  price: z.number().positive('Preço deve ser positivo').finite('Preço deve ser um número válido'),
});

export const CreateOrderSchema = z.object({
  storeId: z.string().regex(/^[0-9a-f]{24}$/i, 'ID da loja inválido'),
  products: z.array(OrderProductSchema).min(1, 'Pedido deve ter pelo menos 1 produto').max(50, 'Máximo 50 produtos por pedido'),
  deliveryDistanceKm: z.number().min(0, 'Distância inválida').max(100, 'Distância máxima é 100km').finite('Distância deve ser um número válido'), // 0 = Plano 1 (sem entrega integrada)
  paymentMethod: z.enum(['credit_card', 'pix', 'money']).optional(),
  address: z.string().min(10, 'Endereço muito curto').max(500, 'Endereço muito longo').optional(),
  latitude: z.number().min(-90, 'Latitude inválida').max(90, 'Latitude inválida').finite('Latitude deve ser um número válido').optional(),
  longitude: z.number().min(-180, 'Longitude inválida').max(180, 'Longitude inválida').finite('Longitude deve ser um número válido').optional(),
  idempotentKey: z.string().uuid('Idempotent key deve ser um UUID válido').optional(),
  cupomCode: z.string().min(3, 'Cupom muito curto').max(20, 'Cupom muito longo').toUpperCase().optional(),
}).strict();

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['criado', 'pago', 'enviado', 'entregue', 'cancelado', 'rejeitado']),
});

export const RateStoreSchema = z.object({
  storeRating: z.number().int().min(1, 'Nota mínima é 1').max(5, 'Nota máxima é 5'),
  storeComment: z.string().max(500).optional(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type OrderProductInput = z.infer<typeof OrderProductSchema>;
export type RateStoreInput = z.infer<typeof RateStoreSchema>;

// ============= DELIVERY SCHEMAS =============
export const CreateDeliverySchema = z.object({
  orderId: z.string().regex(/^[0-9a-f]{24}$/i, 'ID do pedido inválido'),
  driverId: z.string().regex(/^[0-9a-f]{24}$/i, 'ID do motorista inválido').optional(),
  pickupAddress: z.object({
    street: z.string().min(3),
    number: z.string().min(1),
    neighborhood: z.string().min(3),
    city: z.string().min(3),
    state: z.string().length(2),
    cep: z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos'),
  }),
  deliveryAddress: z.object({
    street: z.string().min(3),
    number: z.string().min(1),
    neighborhood: z.string().min(3),
    city: z.string().min(3),
    state: z.string().length(2),
    cep: z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos'),
  }),
});

export type CreateDeliveryInput = z.infer<typeof CreateDeliverySchema>;

// ============= ADDRESS SCHEMAS =============
export const AddressSchema = z.object({
  label: z.string().min(2).max(50).optional(),
  street: z.string().min(3, 'Rua deve ter pelo menos 3 caracteres'),
  number: z.string().min(1),
  neighborhood: z.string().min(3),
  city: z.string().min(3),
  state: z.string().length(2, 'Estado deve ter 2 caracteres (UF)'),
  cep: z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos'),
  latitude: z.string().regex(/^-?\d+\.?\d*$/, 'Latitude inválida').optional(),
  longitude: z.string().regex(/^-?\d+\.?\d*$/, 'Longitude inválida').optional(),
});

export const CreateAddressSchema = AddressSchema;
export const UpdateAddressSchema = AddressSchema.partial();

export type AddressInput = z.infer<typeof AddressSchema>;

// ============= STORE SCHEMAS =============
export const CreateStoreSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(200),
  description: z.string().min(10).max(1000).optional(),
  phone: z.string().regex(/^\d{10,11}$/, 'Telefone inválido'),
  address: AddressSchema,
  category: z.string().min(2).optional(),
  minDeliveryAmount: z.number().nonnegative().optional(),
  maxDeliveryDistance: z.number().positive().optional(),
});

export const UpdateStoreSchema = CreateStoreSchema.partial();

export type CreateStoreInput = z.infer<typeof CreateStoreSchema>;
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;

// ============= WALLET SCHEMAS =============
export const CreditWalletSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo').max(100000, 'Máximo R$ 100.000'),
  paymentMethod: z.enum(['credit_card', 'pix', 'bank_transfer']),
  reference: z.string().optional()
});

export const TransferWalletSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo'),
  bankAccount: z.object({
    banco: z.string().min(1, 'Banco obrigatório'),
    agencia: z.string().min(1, 'Agência obrigatória'),
    conta: z.string().min(1, 'Conta obrigatória'),
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

// ============= VALIDATION HELPER =============
export const validateRequest = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  return schema.parse(data);
};

export const validateRequestSafe = <T>(schema: z.ZodSchema<T>, data: unknown) => {
  const result = schema.safeParse(data);
  return result;
};
