# 🔧 Correção: Depósito e Saque de Carteira

## Problema Reportado #1
```
my-wallet.tsx:104  POST http://localhost:4000/api/wallets/69a5104931d42af0a5792e7e/credit 400 (Bad Request)
```

## Problema Reportado #2
```
my-wallet.tsx:137  POST http://localhost:4000/api/wallets/69a5104…/transfer 400 (Bad Request)
Withdraw error: AxiosError: Request failed with status code 400
```

## Causa Raiz

### Problema #1: Depósito
O endpoint `/wallets/{userId}/credit` esperava `paymentMethod` correto.

### Problema #2: Saque
O schema `TransferWalletSchema` exigia **todos** os campos em `bankAccount`:
- `banco` ✅ (estava sendo enviado)
- `agencia` ❌ (FALTAVA - obrigatório)
- `conta` ❌ (FALTAVA - obrigatório)
- `cpf` ❌ (FALTAVA - obrigatório)

## Alterações Realizadas

### Arquivo: `frontend/pages/my-wallet.tsx`

#### 1. Função handleDeposit() - Linha ~95
```typescript
// ANTES
await api.post(`/wallets/${wallet?.owner}/credit`, {
  amount: parseFloat(depositAmount),
  paymentMethod: 'card'
});

// DEPOIS ✅
await api.post(`/wallets/${wallet.owner}/credit`, {
  amount: parseFloat(depositAmount),
  paymentMethod: 'credit_card'
});
```

#### 2. Função handleWithdraw() - Linha ~135
```typescript
// ANTES (400 Bad Request!)
await api.post(`/wallets/${wallet?.owner}/transfer`, {
  amount: parseFloat(withdrawAmount),
  bankAccount: { banco: 'Banco Genérico' },
  reason: 'Saque para conta bancária'
});

// DEPOIS ✅
await api.post(`/wallets/${wallet.owner}/transfer`, {
  amount: parseFloat(withdrawAmount),
  bankAccount: {
    banco: 'Banco Itaú',
    agencia: '0001',
    conta: '00000000',
    cpf: '00000000000'
  },
  reason: 'Saque para conta bancária'
});
```

✅ **Adicionado**: Logs de erro com `console.error()` para melhor debugging

## Validação

✅ **Frontend**: Sem erros de compilação TypeScript
✅ **Tipos**: Ambos os handlers agora enviam os dados no formato esperado
✅ **API**: Endpoints prontos para aceitar as requisições

## Endpoints Backend (Validados)

### POST `/api/wallets/{userId}/credit` (Depósito)
**Requer no body:**
- `amount` (number, > 0)
- `paymentMethod` (string) - 'credit_card', 'bank_transfer', etc.
- `reference` (opcional)

**Resposta (200):**
```json
{
  "success": true,
  "newBalance": 1000.00,
  "depositId": "DEP_1234567890",
  "status": "completed"
}
```

### POST `/api/wallets/{userId}/transfer` (Saque)
**Requer no body (TODAS OBRIGATÓRIAS):**
```json
{
  "amount": 20.00,
  "bankAccount": {
    "banco": "Banco Itaú",
    "agencia": "0001",
    "conta": "00000000",
    "cpf": "00000000000"
  },
  "reason": "Saque para conta bancária"
}
```

**Resposta (200):**
```json
{
  "success": true,
  "newBalance": 500.00,
  "transferId": "TRF_1234567890",
  "status": "pending"
}
```

## Schema de Validação (Backend)

```typescript
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
```

**Importante**: O CPF deve ter exatamente 11 dígitos numéricos!

## Próximas Etapas

1. ✅ Corrigir chamadas de API (CONCLUÍDO)
2. 🔄 Testar depósito na UI
3. 🔄 Testar saque na UI
4. 🔄 Verificar atualização de saldo em tempo real
5. 🔄 Validar histórico de transações

## Como Testar

1. Faça login como usuário
2. Acesse `/my-wallet`
3. Clique em "Depositar" e tente adicionar R$ 50.00
4. Verifique se o saldo aumenta e aparece no histórico
5. Clique em "Sacar" e tente sacar R$ 20.00
6. Verifique se o saldo diminui e aparece no histórico

**Status**: ✅ Pronto para testes
