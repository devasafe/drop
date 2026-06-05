# 🧪 GUIA DE TESTES: Carteiras Lojista vs Motoboy

## 📋 Pré-requisitos

- [x] Backend rodando (`npm run start`)
- [x] Frontend rodando (`npm run dev`)
- [x] MongoDB conectado
- [x] Contas de teste preparadas:
  - Um usuário LOJISTA com loja criada
  - Um usuário CLIENTE
  - Um usuário MOTOBOY

---

## 🧪 TESTE 1: Lojista Recebe Dinheiro de Pedido

### Setup
```
Usuário: Lojista "João Silva"
Loja: "João's Pizza Place"
Saldo inicial (store): R$ 0,00
```

### Passo 1: Verificar Saldo Inicial
1. Abra `http://localhost:3000/my-wallet`
2. Login como LOJISTA
3. Na navbar, clique avatar
4. Certifique que role está em "Loja" (🏪)
5. Veja o saldo: **deve ser R$ 0,00**
6. Note o `storeId` nos logs

**Esperado:**
```
💰 Saldo Disponível: R$ 0,00
📥 Total Recebido: R$ 0,00
```

### Passo 2: Cliente Fazer Pedido
1. Abra em outra aba `http://localhost:3000/`
2. Login como CLIENTE
3. Procure um produto da loja do lojista
4. Adicione à sacola
5. Vá para checkout
6. **Preço total: ex R$ 100,00**
7. Clique "Fazer Pedido"
8. **Esperado: Pedido criado com sucesso** ✅

**Validar:**
- Status do pedido: "Criado" ou "Enviado"
- Cliente vê pedido em "Meus Pedidos"

### Passo 3: Lojista Vê Saldo Aumentar
1. Volte à aba do LOJISTA
2. Atualize `/my-wallet` (F5 ou botão refresh)
3. **Esperado: Saldo aumentou**

```
Cálculo esperado:
Pedido: R$ 100,00
Comissão: 20% = R$ 20,00
Loja recebe: R$ 80,00 (100 - 20)
├─ Saldo store: R$ 80,00 ✅
├─ Total Recebido: R$ 80,00 ✅
└─ Total Enviado: R$ 0,00 ✅
```

### Passo 4: Verificar Histórico
No `/my-wallet`, role down e veja **HISTÓRICO DE TRANSAÇÕES**

```
Esperado:
┌─────────────────────────────────────┐
│ Tipo     │ Categoria │ Valor   │ Motivo  │
├─────────────────────────────────────┤
│ ➕ Crédito│ Pagamento │ +R$80   │ Venda   │
└─────────────────────────────────────┘
```

---

## 🧪 TESTE 2: Lojista Transfere para Carteira de Usuário

### Setup (Continue do Teste 1)
```
Carteira Store: R$ 80,00
Carteira User: R$ 0,00 (ainda não tocou)
```

### Passo 1: Ver Botão "Enviar para Usuário"
Na página `/my-wallet` (role: loja), você deve ver:

```
[↙️ Enviar para Usuário]
```

**Esperado:** Botão está visível

### Passo 2: Clicar no Botão
Clique em `[↙️ Enviar para Usuário]`

**Esperado:**
```
Um formulário aparece:
┌──────────────────────────────┐
│ ↙️ Enviar para Usuário        │
├──────────────────────────────┤
│ Saldo disponível: R$ 80,00   │
│ Quanto deseja enviar?        │
│ [       30.00         ]      │ (input)
│ [✓ Confirmar Envio] (botão) │
└──────────────────────────────┘
```

### Passo 3: Digitar Valor
- Valor: **R$ 30,00**
- Clique `[✓ Confirmar Envio]`

**Esperado:**
```
✅ Operação realizada com sucesso!
```

### Passo 4: Verificar Saldos Atualizados
Aguarde a página recarregar automaticamente

```
STORE (Loja):
├─ Saldo: R$ 50,00 (80 - 30) ✅
├─ Total Recebido: R$ 80,00 ✅
├─ Total Enviado: R$ 30,00 ✅
└─ Histórico: Transferência -R$ 30 ✅

USER (será verificado em TESTE 3)
```

### Passo 5: Verificar Histórico
```
Esperado:
┌────────────────────────────────────┐
│ Tipo     │ Valor     │ Categoria   │
├────────────────────────────────────┤
│ ➖ Débito │ -R$ 30,00 │ Transferência│
│ ➕ Crédito│ +R$ 80,00 │ Pagamento   │
└────────────────────────────────────┘
```

---

## 🧪 TESTE 3: Lojista Usa Carteira Pessoal

### Setup
```
Store: R$ 50,00
User: R$ 30,00 (da transferência anterior)
```

### Passo 1: Mudar Role
No navbar, clique no **avatar**

```
Opções:
├─ [👤 Usuário] (click aqui)
└─ [🏪 Loja]
```

Clique em `[👤 Usuário]`

**Esperado:**
```
Página recarrega
Mostra: "👤 Minha Carteira - Usuário"
Saldo: R$ 30,00 ✅
```

### Passo 2: Depositar Dinheiro
Clique em `[💳 Depositar]`

```
Formulário aparece:
┌──────────────────────────────┐
│ 💳 Depositar Dinheiro        │
├──────────────────────────────┤
│ Quanto deseja depositar?     │
│ [       50.00         ]      │
│ [✓ Confirmar Depósito] (btn)│
└──────────────────────────────┘
```

- Valor: **R$ 50,00**
- Clique `[✓ Confirmar Depósito]`

**Esperado:**
```
✅ Depósito realizado com sucesso!
Saldo User: R$ 80,00 (30 + 50) ✅
```

### Passo 3: Transferir de Volta para Loja
Clique em `[💸 Transferir]`

```
Formulário aparece:
┌──────────────────────────────┐
│ 💸 Transferir para Loja       │
├──────────────────────────────┤
│ Saldo disponível: R$ 80,00   │
│ Quanto deseja transferir?    │
│ [       25.00         ]      │
│ [✓ Confirmar Transferência] │
└──────────────────────────────┘
```

- Valor: **R$ 25,00**
- Clique `[✓ Confirmar Transferência]`

**Esperado:**
```
✅ Operação realizada com sucesso!
Saldo User: R$ 55,00 (80 - 25) ✅
```

### Passo 4: Voltar e Verificar Loja
Mude role de volta para `[🏪 Loja]`

```
Esperado:
├─ Saldo Store: R$ 75,00 (50 + 25) ✅
├─ Total Recebido: R$ 80,00 ✅
├─ Total Enviado: R$ 5,00 (30 - 25) ✅
└─ Histórico: Novo crédito de +R$ 25
```

### Passo 5: Verificar Histórico
```
Esperado (ordem cronológica):
┌──────────────────────────────────────┐
│ Tipo     │ Valor      │ Categoria    │
├──────────────────────────────────────┤
│ ➕ Crédito│ +R$ 25,00  │ Transferência│
│ ➖ Débito │ -R$ 30,00  │ Transferência│
│ ➕ Crédito│ +R$ 80,00  │ Pagamento    │
└──────────────────────────────────────┘
```

---

## 🧪 TESTE 4: Sacar da Carteira Pessoal

### Setup
```
User: R$ 55,00
Banco configurado: SIM (pré-requisito)
```

### Passo 1: Estar em Carteira de Usuário
Role deve ser `👤 Usuário`

### Passo 2: Clicar Sacar
Clique em `[🏧 Sacar]`

```
Formulário aparece:
┌──────────────────────────────┐
│ 🏧 Sacar Dinheiro            │
├──────────────────────────────┤
│ Saldo disponível: R$ 55,00   │
│ Quanto deseja sacar?         │
│ [       20.00         ]      │
│ [✓ Confirmar Saque] (botão) │
└──────────────────────────────┘
```

- Valor: **R$ 20,00**
- Clique `[✓ Confirmar Saque]`

**Esperado:**
```
✅ Operação realizada com sucesso!
Saldo User: R$ 35,00 (55 - 20) ✅
```

### Passo 3: Verificar no Histórico
```
Novo registro:
┌──────────────────────────────────────┐
│ Tipo     │ Valor      │ Categoria    │
├──────────────────────────────────────┤
│ ➖ Débito │ -R$ 20,00  │ Saque        │
└──────────────────────────────────────┘
```

---

## 🧪 TESTE 5: Comparar com Fluxo Motoboy

### Setup
Você já tem tudo do lojista. Agora teste motoboy:
```
Motoboy: "Pedro Entrega"
```

### Fluxo Esperado
```
1. Motoboy completa entrega (fee = R$ 10,00)
2. Recebe R$ 8,00 na carteira 'motoboy' (80%)
3. Transfere R$ 5,00 para 'user'
4. Saque R$ 3,00 da 'user'
```

**Esperado: Mesmo comportamento que lojista** ✅

---

## 🔍 Checklist de Validação

| Teste | Operação | Status | Esperado |
|-------|----------|--------|----------|
| 1.1 | Loja recebe pedido | ⏳ | Saldo aumenta |
| 1.2 | Histórico atualizado | ⏳ | Crédito de venda |
| 2.1 | Botão "Enviar" visível | ⏳ | Mostra botão |
| 2.2 | Transferência loja→user | ⏳ | Saldos se ajustam |
| 2.3 | Histórico atualizado | ⏳ | Débito de loja |
| 3.1 | Role switching funciona | ⏳ | Muda carteira |
| 3.2 | Depositar no user | ⏳ | Saldo aumenta |
| 3.3 | Transferir user→loja | ⏳ | Saldos se ajustam |
| 3.4 | Loja vê saldo aumentado | ⏳ | Store + crédito |
| 4.1 | Sacar do user | ⏳ | Saldo diminui |
| 4.2 | Histórico de saque | ⏳ | Débito aparece |
| 5.1 | Motoboy mesmo fluxo | ⏳ | Comportamento idêntico |

---

## ⚠️ Problemas Esperados e Soluções

### Problema 1: "Carteira não encontrada"
```
Causa: User.storeId undefined
Solução: 
  node migrate-store-user-relationship.js
```

### Problema 2: "Banco não configurado"
```
Causa: Tentando sacar sem ter configurado banco
Solução:
  /bank-setup → Preencher dados bancários
```

### Problema 3: Transferência não funciona
```
Causa: Possível erro na API
Solução:
  1. Verificar console do navegador (F12)
  2. Verificar logs do backend
  3. POST /wallets/transfer deve retornar 200
```

### Problema 4: Saldo não atualiza
```
Causa: Cache do navegador
Solução:
  F5 (refresh) ou Ctrl+Shift+Del (limpar cache)
```

### Problema 5: Role não muda
```
Causa: Token JWT não atualizado
Solução:
  Logout + Login novamente
  Verificar POST /auth/switch-role
```

---

## 📊 Logs a Monitorar

### Backend Console
```
Buscar por:
✅ [finalizarEntrega] Motoboy wallet credited
✅ [Motoboy Transfer] transferiu
✅ Loja criada e vinculada ao usuário
✅ Transferência de loja para usuário
❌ Erro ao creditar carteira
❌ Saldo insuficiente
```

### Browser Console (F12 → Console)
```
Buscar por:
📍 Loading wallet for role
💰 Wallet loaded
↙️ Transferindo de loja para usuário
↗️ Transferência de usuário para loja
💳 Depositando para usuário
🏧 Sacando
❌ Erro ao...
```

---

## 🎯 Resultado Final Esperado

Se TODOS os 5 testes passarem:

```
✅ TESTE 1: Loja recebe em pedido
✅ TESTE 2: Loja envia para usuário
✅ TESTE 3: Usuário gerencia (deposita, transfere de volta)
✅ TESTE 4: Usuário saca
✅ TESTE 5: Motoboy tem mesmo fluxo

🎉 SISTEMA FUNCIONAL 100%
```

---

**Próximo passo:** Executar os testes e reportar qualquer falha! 🚀
