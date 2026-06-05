# 🚀 GUIA RÁPIDO - TESTAR AGORA

---

## ⚡ 5 Passos para Verificar que Tudo Funciona

### 1️⃣ Reiniciar o Servidor

```powershell
# Mata processo anterior (se houver)
taskkill /PID [PID] /F

# Ou abra novo terminal e rode:
cd d:\PROJETOS\Drop
npm run dev
```

**Esperado no console:**
```
✅ Server listening on port 4000
✅ MongoDB connected
```

---

### 2️⃣ Login como CEO e Acessar Caixa

1. Vá para: `http://localhost:3000/`
2. Login: `ceo@ceo` / `password`
3. Clique em: **💳 Caixa do App** (na navbar)
4. Você deve ver:
   - **Saldo Atual: R$ 0.00** (vazio ainda)
   - **Abas:** Overview, Extrato, Saques
   - **Botões:** ➕ Registrar Depósito, 💸 Solicitar Saque

✅ **Confirmado!** Caixa do app acessível e vazia.

---

### 3️⃣ Criar Pedido (Cliente)

**URL:** `http://localhost:3000/checkout` ou outro cliente

1. **Login como Cliente:**
   - Email: `cliente@cliente`
   - Password: `password`

2. **Montar Carrinho:**
   - Loja: **Loja Teste**
   - Produto: **Qualquer produto** (ex: R$ 100)
   - Distância: **5 km** (vai gerar entrega ~R$ 10)
   - Total esperado: **R$ 110**

3. **Confirmar Pedido**
   - Usar saldo na carteira (deve ter R$ 110+)
   - Clicar em **Confirmar Pedido**

4. **Verificar Logs:**
   ```
   📦 [ORDER][CREATE] ✅ Pedido com distribuição de wallets:
     orderId: 65abc...
     totalValue: 110
     storeAmount: 85
     appCommission: 17
   ```

✅ **Confirmado!** Pedido criado, AppCashbox ainda vazio (aguarda delivery).

---

### 4️⃣ Loja Cria Delivery e Motoboy Completa

1. **Login como Loja:**
   - Email: `loja@teste`
   - Password: `password`

2. **Criar Delivery:**
   - Ir para: Pedidos Pendentes
   - Clicar: **Criar Entrega**
   - Distância: **5 km**
   - Confirmar

3. **Verificar Logs:**
   ```
   ✅ Comissão adicionada ao caixa: delivery_commission = R$ 2.00
   ```

4. **Atribuir Motoboy:**
   - Loja atribui motoboy à delivery
   - Motoboy notificado

5. **Motoboy Finaliza:**
   - Login como Motoboy
   - Aceita delivery
   - Finaliza com PIN
   
6. **Verificar Logs:**
   ```
   ✅ [finalizarEntrega] Motoboy wallet credited: R$ 8.00
   ```

✅ **Confirmado!** Entrega completa, Motoboy ganhou R$ 8.00 (não R$ 10.00).

---

### 5️⃣ CEO Verifica Caixa do App

1. **Login como CEO**
2. **Ir para:** 💳 **Caixa do App**
3. **Verificar:**

   **Tab: Overview**
   - **Saldo Atual:** R$ 2.00 ✅ (comissão de entrega)
   - **Últimas Movimentações:** `delivery_commission - R$ 2.00`

   **Tab: Extrato**
   - **Filtro por data:** Hoje
   - Ver histórico:
     - `delivery_commission - R$ 2.00`
   - Total de renda: R$ 2.00

   **Tab: Saques**
   - **Sem saques** (não fez nenhum ainda)

4. **Testar Depósito:**
   - Clique: **➕ Registrar Depósito**
   - Valor: R$ 500
   - Motivo: "Depósito inicial"
   - Confirmar
   
   **Esperado:**
   - Saldo muda para: R$ 502.00
   - Novo registro no histórico

5. **Testar Saque:**
   - Clique: **💸 Solicitar Saque**
   - Valor: R$ 100
   - Banco: "Banco do Brasil"
   - Conta: "1234-5"
   - Titular: "Empresa Drop"
   - Confirmar
   
   **Esperado:**
   - Novo registro em "Saques" com status: `pending`
   - Saldo MANTÉM: R$ 502.00 (não débita ainda)

6. **Testar Aprovação:**
   - Em Saques, clique: **✅ Aprovar**
   - Confirmar
   
   **Esperado:**
   - Status muda para: `approved`
   - Saldo muda para: R$ 402.00
   - Novo registro no histórico: `withdrawal - R$ 100`

✅ **Confirmado!** CEO gerencia caixa com sucesso.

---

## 🔍 Checklist Final

Marque quando cada item funcionar:

- [ ] **Caixa do App** aparece na navbar do CEO
- [ ] Caixa começa com saldo **R$ 0.00**
- [ ] Após criar delivery, caixa tem **R$ 2.00** (ou seu valor calculado)
- [ ] **Motoboy recebe R$ 8.00** (não R$ 10.00)
- [ ] **Cliente foi debitado R$ 110.00**
- [ ] **Loja recebeu R$ 85.00**
- [ ] **Histórico mostra** tipo e origem corretos
- [ ] **Depósito funciona** (saldo aumenta)
- [ ] **Saque pendente não débita** saldo até aprovação
- [ ] **Saque aprovado débita** corretamente
- [ ] **Cancelamento reverte** AppCashbox (não perde)

---

## 🐛 Se Algo Não Funcionar

### Erro: Rota 404 `/admin/app-cashbox`
```
Solução: Restart servidor (npm run dev)
```

### Erro: "AppCashbox.ts not found"
```
Solução: Verificar arquivo existe em: src/models/AppCashbox.ts
```

### Motoboy recebendo R$ 10 (não R$ 8)
```
Solução: Verificar PlatformConfig.motoboyCommissionPercent é 20 (em /admin/settings)
         Se foi mudado, atualizar e reiniciar
```

### Caixa do App vazio após tudo
```
Solução: Verificar logs do servidor por erros em:
         - createDelivery: "Erro ao registrar comissão de entrega"
         - finalizarEntrega: "Erro ao creditar carteira do motoboy"
```

### Saldo negativo em AppCashbox
```
Solução: Não deve acontecer (há validações)
         Se acontecer: resetar DB e testar novamente
```

---

## 📞 Logs para Monitorar

Abra o console do servidor (npm run dev) e procure por:

```
✅ Comissão adicionada ao caixa: [tipo] = R$ [valor]
✅ [finalizarEntrega] Motoboy wallet credited: R$ [valor]
✅ Saque aprovado: R$ [valor]
✅ Depósito registrado: R$ [valor]
❌ Erro ao registrar comissão - procure por isso se der problema
```

---

## 🎬 Filme do Fluxo Completo (Visual)

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENTE                                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Cria Pedido (R$ 100 + R$ 10)                             │
│ 2. Carteira débito: -R$ 110                                 │
│ 3. Vê pedido em "Meus Pedidos"                              │
└─────────────────────────────────────────────────────────────┘
                            ↓↓↓
┌─────────────────────────────────────────────────────────────┐
│ LOJA                                                        │
├─────────────────────────────────────────────────────────────┤
│ 1. Vê pedido em "Pendentes"                                 │
│ 2. Carteira crédito: +R$ 85                                 │
│ 3. Cria Delivery (distância 5km)                            │
│ 4. Taxa entrega calculada: R$ 10                            │
└─────────────────────────────────────────────────────────────┘
                            ↓↓↓
┌─────────────────────────────────────────────────────────────┐
│ APP CASHBOX                                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. Registra: delivery_commission = R$ 2.00                  │
│ 2. Saldo: R$ 2.00                                           │
│ 3. Histórico: [delivery_commission]                         │
└─────────────────────────────────────────────────────────────┘
                            ↓↓↓
┌─────────────────────────────────────────────────────────────┐
│ MOTOBOY                                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Notificado: "Ganho R$ 8.00"                              │
│ 2. Aceita delivery                                          │
│ 3. Finaliza entrega                                         │
│ 4. Carteira crédito: +R$ 8.00                               │
└─────────────────────────────────────────────────────────────┘
                            ↓↓↓
┌─────────────────────────────────────────────────────────────┐
│ CEO (Caixa do App)                                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Vê saldo: R$ 2.00                                        │
│ 2. Histórico:                                               │
│    - delivery_commission: +R$ 2.00                          │
│ 3. Pode depositar ou sacar quando quiser                    │
└─────────────────────────────────────────────────────────────┘

TOTAL: 85 (loja) + 8 (motoboy) + 2 (app) + 15 (app produto) = 110 ✅
```

---

**Teste agora e me avise se der tudo certo! 🚀**
