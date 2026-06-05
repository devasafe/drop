# 🚀 COMECE AQUI: Teste Rápido em 5 Minutos

## ⚡ Objetivo
Validar que **lojista pode usar carteiras exatamente como motoboy**.

---

## 📋 Pré-requisito Rápido

### Você tem:
- [ ] Backend rodando (`npm run start`)
- [ ] Frontend rodando (`npm run dev`)
- [ ] Uma conta LOJISTA com loja criada
- [ ] Uma conta CLIENTE para fazer pedido
- [ ] MongoDB funcionando

### Se não tem User.storeId:
```bash
# Execute no terminal (uma vez)
node migrate-store-user-relationship.js
```

---

## 🧪 TESTE RÁPIDO: 5 PASSOS

### PASSO 1: Lojista vê saldo inicial (1 min)
```
1. Abra http://localhost:3000/my-wallet
2. Login como LOJISTA
3. No navbar, avatar → Role deve estar em "🏪 Loja"
4. Veja saldo: deve ser R$ 0,00

✅ Resultado esperado:
   💰 Saldo Disponível: R$ 0,00
```

### PASSO 2: Cliente faz pedido (2 min)
```
1. Outra aba: http://localhost:3000
2. Login como CLIENTE
3. Procure produto da loja do lojista
4. Adicione ao carrinho: R$ 100,00
5. Checkout → Fazer Pedido

✅ Resultado esperado:
   Pedido criado com sucesso!
```

### PASSO 3: Lojista vê saldo aumentar (1 min)
```
1. Volte aba do LOJISTA
2. F5 (refresh) em /my-wallet
3. Veja novo saldo

✅ Resultado esperado:
   💰 Saldo Disponível: R$ 80,00
   (100 pedido - 20% comissão = 80)
```

### PASSO 4: Lojista transfere para usuário (1 min)
```
1. Na página /my-wallet (role: loja)
2. Clique [↙️ Enviar para Usuário]
3. Digite: 50
4. Clique [✓ Confirmar Envio]

✅ Resultado esperado:
   ✅ Operação realizada com sucesso!
   Novo saldo: R$ 30,00
```

### PASSO 5: Lojista muda role e vê carteira pessoal (0 min)
```
1. Navbar → Avatar
2. Clique [👤 Usuário]
3. Veja novo saldo

✅ Resultado esperado:
   💰 Saldo Disponível: R$ 50,00
```

---

## 🎯 Resultado

Se todos os 5 passos funcionarem:

```
🎉 SUCESSO! 
Lojista funciona IGUAL motoboy!

Fluxo validado:
✅ Recebe R$ automaticamente
✅ Transfere para usuário
✅ Vê carteira pessoal
✅ Pode fazer operações
```

---

## ❌ Se algo falhar

### Erro 1: "Carteira não encontrada"
```bash
node migrate-store-user-relationship.js
```

### Erro 2: "Não consigo transferir"
```bash
# Verificar logs do backend
# Procurar por: Transferência de loja para usuário
# Se houver erro, verificar console do navegador (F12)
```

### Erro 3: "Saldo não muda"
```bash
F5 (refresh manual)
Ou Ctrl+Shift+Del (limpar cache)
```

### Erro 4: "Role não muda"
```bash
Logout + Login novamente
Aguardar JWT ser atualizado
```

---

## 📚 Próximos Passos

Se teste passou:
```
📖 Leia: FLUXO_CARTEIRAS_LOJISTA_MOTOBOY.md
   └─ Entender como tudo funciona

🧪 Faça: TESTES_CARTEIRAS_LOJISTA_MOTOBOY.md
   └─ 5 testes completos
```

---

## 📊 Resumo

| Passo | Ação | Tempo | Status |
|-------|------|-------|--------|
| 1 | Ver saldo inicial | 1 min | ⏳ |
| 2 | Cliente faz pedido | 2 min | ⏳ |
| 3 | Lojista vê saldo | 1 min | ⏳ |
| 4 | Transfere para usuário | 1 min | ⏳ |
| 5 | Muda role | 0 min | ⏳ |
| **Total** | **Teste Completo** | **5 min** | ⏳ |

---

## 🎯 TL;DR

```
1. Lojista: /my-wallet → R$ 0,00
2. Cliente: Faz pedido de R$ 100
3. Lojista: F5 → Vê R$ 80,00 ✅
4. Lojista: Clica "Enviar para Usuário" → R$ 50
5. Lojista: Muda role → Vê carteira pessoal ✅

= PRONTO! Funciona igual motoboy! 🎉
```

---

**Próximo:** Execute agora! ⏱️ 5 minutos
