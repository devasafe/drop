# ⚡ QUICK START - Testar Fix em 5 minutos

**Objetivo:** Validar que comissão de entrega está sendo registrada  
**Tempo:** 5 minutos  
**Dificuldade:** ⭐⭐ Fácil

---

## 📋 PRÉ-REQUISITOS

- Backend rodando: `http://localhost:4000` ✅
- Frontend rodando: `http://localhost:3000` ✅
- MongoDB conectado ✅
- **Console do servidor aberto** (IMPORTANTE!)

---

## 🚀 PASSO 1: VERIFICAR SALDO INICIAL

### Login como CEO

```
URL: http://localhost:3000/admin/dashboard
Role: ceo
Email: seu-email-ceo@test.com
Password: [sua senha]
```

### Ir para AppCashbox

```
Menu > 💳 Caixa do App
```

### Anotar saldo atual

```
Saldo Inicial: R$ ________
```

---

## 🎯 PASSO 2: CRIAR E ACEITAR PEDIDO

### Fazer Login como CLIENTE

```
Role: cliente
Email: seu-email-cliente@test.com
Password: [sua senha]
```

### Criar Pedido

1. Clique em **"🏠 Produtos"**
2. Selecione loja: **"lj"** (ou qualquer loja disponível)
3. Procure por produto chamado **"Teste"** ou **"Comissão"**
4. Se não existir, crie:
   - Nome: `Teste Comissão`
   - Preço: `R$ 100`
   - Descrição: `Produto para testar comissão`
   - Quantidade: `1`
5. **Adicione ao carrinho**
6. Clique em **"🛒 Carrinho"**
7. Insira distância: `5` km
8. Forma de pagamento: **"Saldo da Carteira"** (mais rápido)
9. Clique em **"✅ CONFIRMAR PEDIDO"**

### Anotar Order ID

```
Order ID: ____________________________
Valor total: R$ 100
Distância: 5 km
```

---

## 🏪 PASSO 3: LOJA ACEITA PEDIDO

### Fazer Login como LOJA

```
Role: lojista
Email: seu-email-loja@test.com
Password: [sua senha]
```

### Aceitar Pedido

1. Menu > **"🏠 Produtos"**
2. Abas no topo > **"📋 Pedidos Pendentes"** (ou "Pedidos")
3. Procure pelo pedido criado (procure pelo Order ID ou valor R$ 100)
4. Clique no pedido
5. Clique em **"✅ ACEITAR PEDIDO"**
6. Confirme distância: `5` km
7. Clique em **"Confirmar"**

### **IMPORTANTE: Monitore o Console do Servidor**

Procure por este log:

```
🔍 [acceptOrder] REGISTRANDO COMISSÃO DE ENTREGA:
   📦 Produto total: R$ 100
   🚗 Taxa de entrega: R$ 14.50
   📍 Distância: 5km
   🏪 Store ID: (hexadecimal ID)

✅ DISTRIBUIÇÃO CALCULADA:
   💳 Produto App Commission: R$ 15.00
   🚗 Entrega App Commission: R$ 2.90
   👤 Motoboy Amount (líquido): R$ 11.60

📡 REGISTRANDO COMISSÃO DE ENTREGA: R$ 2.90
✅ COMISSÃO DE ENTREGA REGISTRADA COM SUCESSO!
```

---

## ✅ PASSO 4: VERIFICAR APPCASHBOX

### Login como CEO

```
Role: ceo
Email: seu-email-ceo@test.com
```

### Ir para AppCashbox

```
Menu > 💳 Caixa do App
```

### Verificar Saldo

```
Saldo Anterior: R$ ________
Saldo Atual: R$ ________
Diferença: R$ ________

ESPERADO: +R$ 17.90 (R$ 15 produto + R$ 2.90 entrega)
```

### Verificar Histórico

Procure por:

```
✅ Comissão de Produto
   Data/Hora: 12/03/2026, HH:MM:SS
   Valor: +R$ 15.00

✅ Comissão de Entrega  ← NOVO!
   Data/Hora: 12/03/2026, HH:MM:SS (alguns segundos depois)
   Valor: +R$ 2.90
```

---

## 🎉 RESULTADO

### ✅ SE VER OS LOGS E A COMISSÃO APARECEU

```
┌──────────────────────────────────────────────┐
│   🎉 SISTEMA FUNCIONANDO PERFEITAMENTE! 🎉   │
│                                              │
│  ✅ Logs aparecem no console                 │
│  ✅ Comissão de entrega registrada           │
│  ✅ AppCashbox saldo aumentou                │
│  ✅ Histórico mostra ambas comissões         │
│                                              │
│  PRÓXIMO: Use CHECKLIST_TESTES_COMISSOES.md │
│  para testes mais completos                 │
└──────────────────────────────────────────────┘
```

### ❌ SE NÃO VER OS LOGS

1. **Verifique se está vendo o console certo:**
   - Não confunda console do browser com console do servidor
   - Console do servidor deve estar NO TERMINAL onde você rodou `npm run dev`

2. **Procure por erros:**
   ```
   ❌ ERRO ao registrar comissão de entrega
   ```

3. **Se não encontrar nada:**
   - Verifique se o backend foi restartado depois dos fixes
   - Feche o terminal e rode novamente: `npm run dev`

---

## 📝 CHECKLIST RÁPIDO

- [ ] Backend rodando
- [ ] Console do servidor aberto
- [ ] Anotei saldo inicial do AppCashbox
- [ ] Criei pedido como cliente (R$ 100)
- [ ] Aceitei pedido como loja (5 km)
- [ ] Vi logs no console do servidor
- [ ] Logs contêm "✅ COMISSÃO DE ENTREGA REGISTRADA COM SUCESSO!"
- [ ] AppCashbox saldo aumentou (~R$ 18)
- [ ] Histórico mostra "Comissão de Entrega"

**Tudo marcado?** ✅ Sistema funcionando!

---

## 🎯 PRÓXIMAS AÇÕES

Depois deste teste rápido:

1. **Se funcionou:**
   - Use `CHECKLIST_TESTES_COMISSOES.md` para teste completo
   - Teste os outros 2 fluxos (rejeitar pedido, criar delivery explícita)

2. **Se não funcionou:**
   - Copie os logs
   - Verifique erros no console do servidor
   - Valide que backend foi restartado após os fixes

---

## 💡 DICA IMPORTANTE

Se você não ver nada nos logs, é porque provavelmente:

```
❌ ANTES (código antigo ainda rodando)
   - Backend rodando código velho
   - Precisa fazer:
     1. Ctrl+C no terminal
     2. npm run dev
     3. Aguarde compilar
     4. Tente novamente

✅ DEPOIS (código novo rodando)
   - Logs aparecem normalmente
   - Comissão registra corretamente
```

---

## 🚀 BOA SORTE!

Se tudo funcionar, **o sistema está pronto para uso**! 🎉

Se tiver dúvidas, coloque essa informação:
- [ ] Qual passo falhou?
- [ ] Qual o erro exato?
- [ ] Print dos logs do servidor?
- [ ] Qual role estava usando quando falhou?

**Tempo esperado:** 5-10 minutos ⏱️

