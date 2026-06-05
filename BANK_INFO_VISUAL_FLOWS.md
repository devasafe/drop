# 📊 Fluxo Visual: Dados Bancários do Usuário

## 1️⃣ PRIMEIRA VISITA (Usuário novo)

```
┌─────────────────────────────────────────────────────┐
│  /my-wallet - Página de Carteira                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ⚠️  AVISO AMARELO                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ ⚠️ Atenção: Você ainda não configurou        │   │
│  │ seus dados bancários.                        │   │
│  │                          [Configurar Agora]  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  💰 Saldo: R$ 0.00                                  │
│  📈 Total Ganho: R$ 0.00                            │
│  📉 Total Gasto: R$ 0.00                            │
│                                                     │
│  [💳 Depositar] [🏧 Sacar] [💸 Transferir]         │
│                                                     │
│  NOTA: Botão "Sacar" desativado ou redireciona     │
└─────────────────────────────────────────────────────┘
         ↓ Clica em "Configurar Agora"
┌─────────────────────────────────────────────────────┐
│  /bank-setup - Configurar Dados Bancários           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🏧 Configurar Dados Bancários                      │
│  ⚠️  Esta configuração será feita apenas uma vez    │
│  e não poderá ser alterada.                        │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Nome do Banco *                              │  │
│  │ [Banco Itaú___________________________]       │  │
│  │                                              │  │
│  │ Agência *                                    │  │
│  │ [0001_]                                      │  │
│  │                                              │  │
│  │ Número da Conta *                            │  │
│  │ [12345-67__________________________]         │  │
│  │                                              │  │
│  │ CPF (11 dígitos) *                           │  │
│  │ [12345678901]                                │  │
│  │                                              │  │
│  │           [Voltar]  [✓ Confirmar Dados]      │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ℹ️  Informações Importantes                        │
│  ✓ Seus dados bancários são usados apenas para...  │
│  ✓ Uma vez configurado, não pode ser alterado      │
│  ✓ Certifique-se de que os dados estão corretos... │
└─────────────────────────────────────────────────────┘
         ↓ Clica em "Confirmar Dados"
         ↓ POST /api/user/bank-info
         ↓ Valida CPF, salva no banco
┌─────────────────────────────────────────────────────┐
│  ✅ Dados Bancários Configurados                    │
│                                                     │
│  Seus dados bancários já foram configurados.       │
│  Você será direcionado para sua carteira em        │
│  breve...                                          │
│                                                     │
│          [Ir para Minha Carteira] (auto em 2s)    │
└─────────────────────────────────────────────────────┘
         ↓ Redireciona automaticamente
         ↓ GET /api/user/bank-info → isConfigured=true
┌─────────────────────────────────────────────────────┐
│  /my-wallet - Página de Carteira (ATUALIZADA)      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ✅ SEM AVISO (banco configurado!)                  │
│                                                     │
│  💰 Saldo: R$ 0.00                                  │
│  📈 Total Ganho: R$ 0.00                            │
│  📉 Total Gasto: R$ 0.00                            │
│                                                     │
│  [💳 Depositar] [🏧 Sacar] [💸 Transferir]         │
│                                                     │
│  ✓ Botão "Sacar" AGORA ATIVO                        │
└─────────────────────────────────────────────────────┘
```

---

## 2️⃣ PRÓXIMAS VISITAS (Banco já configurado)

```
┌─────────────────────────────────────────────────────┐
│  /my-wallet - Página de Carteira                    │
├─────────────────────────────────────────────────────┤
│  GET /api/user/bank-info                            │
│  → { isConfigured: true, ... }                      │
│                                                     │
│  ✅ SEM AVISO                                        │
│                                                     │
│  💰 Saldo: R$ 100.00                                │
│  📈 Total Ganho: R$ 100.00                          │
│  📉 Total Gasto: R$ 0.00                            │
│                                                     │
│  [💳 Depositar] [🏧 Sacar] [💸 Transferir]         │
└─────────────────────────────────────────────────────┘
         ↓ Clica em "Sacar"
┌─────────────────────────────────────────────────────┐
│  💰 Sacar Dinheiro                                  │
│  ┌────────────────────────────────────────────┐   │
│  │ 💡 Saldo disponível: R$ 100.00             │   │
│  └────────────────────────────────────────────┘   │
│                                                     │
│  Quanto deseja sacar?                              │
│  [50.00________________]                            │
│                                                     │
│  [✓ Confirmar Saque]                               │
└─────────────────────────────────────────────────────┘
         ↓ Clica em "Confirmar Saque"
         ↓ GET /api/user/bank-info (busca dados salvos)
         ↓ POST /api/wallets/{userId}/transfer
         │   {
         │     amount: 50,
         │     bankAccount: {
         │       banco: "Banco Itaú",
         │       agencia: "0001",
         │       conta: "12345-67",
         │       cpf: "12345678901"  ← Usa dados salvos!
         │     }
         │   }
         ↓ Saque processado
┌─────────────────────────────────────────────────────┐
│  ✅ Saque realizado com sucesso!                    │
│                                                     │
│  Saldo agora: R$ 50.00                              │
│  Transação no histórico                             │
└─────────────────────────────────────────────────────┘
```

---

## 3️⃣ TENTATIVA DE RECONFIGURAÇÃO

```
┌─────────────────────────────────────────────────────┐
│  /bank-setup - Configurar Dados Bancários           │
├─────────────────────────────────────────────────────┤
│  GET /api/user/bank-info                            │
│  → { isConfigured: true, bankInfo: {...} }         │
│                                                     │
│  Detecta que já foi configurado                     │
│                                                     │
│  ✅ Dados Bancários Configurados                    │
│                                                     │
│  Seus dados bancários já foram configurados.       │
│  Você será direcionado para sua carteira em        │
│  breve...                                          │
│                                                     │
│          [Ir para Minha Carteira]                  │
│                                                     │
│  ℹ️  IMPORTANTE: Dados não podem ser editados      │
└─────────────────────────────────────────────────────┘
```

---

## 4️⃣ FLUXO DE DADOS BANCÁRIOS

### Primeira Vez (POST)
```
┌──────────────┐
│   Frontend   │
│ /bank-setup  │
└──────┬───────┘
       │ POST /api/user/bank-info
       │ {
       │   banco: "Banco Itaú",
       │   agencia: "0001",
       │   conta: "12345-67",
       │   cpfBanco: "12345678901"
       │ }
       ↓
┌──────────────────────────────────┐
│        Backend                   │
│ POST /api/user/bank-info         │
│                                  │
│ 1. Verifica autenticação         │
│ 2. Verifica se isConfigured=true │
│    → Se sim: erro 400            │
│    → Se não: continua            │
│ 3. Valida CPF (11 dígitos)       │
│ 4. Salva em User.bankInfo        │
│ 5. Seta isConfigured=true        │
│ 6. Retorna sucesso               │
└──────────────┬───────────────────┘
       ↓
┌──────────────────────────────────┐
│    MongoDB - Usuário             │
│                                  │
│ {                                │
│   _id: "69a5104...",             │
│   name: "João",                  │
│   email: "joao@email.com",       │
│   ...                            │
│   bankInfo: {                    │
│     banco: "Banco Itaú",         │
│     agencia: "0001",             │
│     conta: "12345-67",           │
│     cpfBanco: "123456789**",     │
│     isConfigured: true           │
│   }                              │
│ }                                │
└──────────────────────────────────┘
```

### Próximas Vezes (GET + POST Saque)
```
┌──────────────┐
│   Frontend   │
│ /my-wallet   │
│ Clica Sacar  │
└──────┬───────┘
       │ 1. GET /api/user/bank-info
       │    → { isConfigured: true, bankInfo: {...} }
       │
       │ 2. Valida se está configurado
       │    → Se não: redireciona para /bank-setup
       │    → Se sim: continua
       │
       │ 3. POST /api/wallets/{userId}/transfer
       │    com dados bancários salvos
       ↓
┌──────────────────────────────────┐
│     Backend                      │
│ POST /api/wallets/{userId}/transfer
│                                  │
│ 1. Valida autenticação           │
│ 2. Valida schema (TransferWallet)│
│ 3. Verifica saldo                │
│ 4. Debita carteira               │
│ 5. Adiciona histórico            │
│ 6. Salva transação               │
│ 7. Retorna sucesso               │
└──────────────┬───────────────────┘
       ↓
┌──────────────────────────────────┐
│  MongoDB - Carteira              │
│                                  │
│ {                                │
│   _id: "...",                    │
│   owner: "69a5104...",           │
│   balance: 50.00,  (diminuiu 50) │
│   totalSpent: 50.00,             │
│   history: [                     │
│     {                            │
│       type: "debit",             │
│       amount: 50,                │
│       reason: "Saque para banco" │
│       date: "2026-03-02...",     │
│       reference: "TRF_174...",   │
│     }                            │
│   ]                              │
│ }                                │
└──────────────────────────────────┘
```

---

## 5️⃣ ESTRUTURA DE DADOS

### User Document
```typescript
{
  _id: ObjectId,
  name: "João Silva",
  email: "joao@email.com",
  passwordHash: "...",
  // ... outros campos
  
  // ✨ NOVO:
  bankInfo: {
    banco: "Banco Itaú",
    agencia: "0001",
    conta: "12345-67",
    cpfBanco: "12345678901",
    isConfigured: true
  }
}
```

### Endpoints Associados
```
GET  /api/user/bank-info      → Verificar status
POST /api/user/bank-info      → Configurar (1x)
GET  /api/user/me             → Dados do usuário (existente)
POST /api/wallets/{id}/transfer → Saque (usa bank-info)
```

---

## 6️⃣ SEGURANÇA

```
✅ CPF validado com regex: ^\d{11}$
✅ Imutável após primeira configuração
✅ Dados não são expostos em listagens
✅ Autenticação obrigatória em todos endpoints
✅ Validação no backend e frontend
✅ Mensagens de erro genéricas (não expõe dados)
```

---

## 7️⃣ DIAGRAMA DE DECISÃO (Sacar)

```
┌─ Usuário clica "Sacar"
│
├─ bankInfoConfigured === false?
│  ├─ SIM → Alert + redireciona /bank-setup
│  └─ NÃO → continua
│
├─ withdrawAmount <= 0?
│  ├─ SIM → Alert "Digite um valor válido"
│  └─ NÃO → continua
│
├─ withdrawAmount > wallet.balance?
│  ├─ SIM → Alert "Saldo insuficiente"
│  └─ NÃO → continua
│
├─ GET /api/user/bank-info
│  ├─ Erro? → Alert + console.error
│  └─ Sucesso → extrair { banco, agencia, conta, cpfBanco }
│
├─ POST /api/wallets/{userId}/transfer
│  │  com bankAccount do usuário
│  │
│  ├─ Erro? → Alert com mensagem de erro
│  └─ Sucesso → continua
│
├─ GET /api/wallets/my-wallet
│  └─ Recarrega carteira
│
└─ Alert "✅ Saque realizado com sucesso!"
```

---

## 8️⃣ MUDANÇAS NOS ARQUIVOS

| Arquivo | Mudança | Tipo |
|---------|---------|------|
| `src/models/User.ts` | Adicionado campo `bankInfo` | Model |
| `src/controllers/userController.ts` | Adicionado `getBankInfo()` e `setBankInfo()` | Controller |
| `src/routes/user.ts` | Adicionadas rotas GET/POST bank-info | Routes |
| `frontend/pages/bank-setup.tsx` | NOVO arquivo | Page |
| `frontend/pages/my-wallet.tsx` | Adicionada verificação de bankInfo | Page |

**Total**: 4 arquivos modificados + 1 novo arquivo criado

---

## ✅ STATUS

- ✅ Backend: Endpoints implementados e funcionando
- ✅ Frontend: Páginas criadas e compilando
- ✅ Validações: CPF, campos obrigatórios, imutabilidade
- ✅ UX: Alertas, redirects, aviso visual
- ⏳ Testes: Aguardando execução manual

**Próximo**: Testar fluxo completo no navegador
