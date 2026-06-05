# 🔧 Fix: Frontend não atualiza quando muda de role

## 🐛 Bug Identificado

Quando você clica para trocar de role (lojista → cliente), o frontend:
1. ✅ Troca o role corretamente
2. ✅ Atualiza o token
3. ❌ MAS não recarrega os dados da carteira nova
4. ❌ Fica mostrando a carteira antiga (tudo 0)

---

## 🔍 Causa Raiz

Existem **2 problemas**:

### Problema 1: Dependency Array do useEffect
No arquivo `my-wallet.tsx`, o `useEffect` tinha:
```typescript
// ❌ ANTIGO (ERRADO)
}, [user, user?.activeRole, authLoading, router]);
```

O problema é que `user` é um **objeto**, e quando objeto muda, React força re-render mesmo que só `activeRole` tenha mudado.

**SOLUÇÃO**: Verificar só as propriedades específicas:
```typescript
// ✅ NOVO (CORRETO)
}, [user?.id, user?.activeRole, authLoading]);
```

### Problema 2: Loading flag não resetava
Quando você trocava de role, o `loading` permanecia `false`, impedindo a recarregar.

**SOLUÇÃO**: Resetar `loading = true` quando role muda.

---

## ✅ Mudanças Já Aplicadas

### Arquivo: `frontend/pages/my-wallet.tsx`

#### Mudança 1: Debug melhorado (Linha ~26)
```typescript
// ✅ NOVO: Debug para rastrear mudanças de role
const currentRole = user?.activeRole || user?.role || 'cliente';
useEffect(() => {
  console.log('🔔 ROLE CHANGED DETECTED:', { 
    oldRole: user?.role, 
    activeRole: user?.activeRole, 
    currentRole 
  });
}, [currentRole]);
```

#### Mudança 2: Fix do useEffect (Linha ~41)
```typescript
// ANTES (ERRADO):
useEffect(() => {
  // ... code ...
  const activeRole = user.activeRole || 'cliente';
  const res = await api.get(`/wallets/my-wallet/by-role/${activeRole}`);
  setWallet(res.data);
}, [user, user?.activeRole, authLoading, router]);  // ❌ user objeto inteiro

// DEPOIS (CORRETO):
useEffect(() => {
  // ... code ...
  const activeRole = user.activeRole || user.role || 'cliente';
  setLoading(true);  // ← ✅ RESETAR LOADING
  // ... fetch ...
  setWallet(res.data);
}, [user?.id, user?.activeRole, authLoading]);  // ✅ Só propriedades
```

---

## 🧪 Teste para Validar

### Passo 1: Abrir Console (F12)
```
Pressione F12 → Console tab
```

### Passo 2: Fazer Login
```
Login como lojista
Observe: 
✅ Token set in axios
📍 Loading wallet for role: cliente
💰 Wallet loaded: { ... }
```

### Passo 3: Mudar para Lojista
```
Clique avatar → [🏪 Loja]

Observe TODOS esses logs nesta ordem:
1. 🔀 handleSwitchRole called with: lojista
2. 🔄 Switching role to: lojista
3. 📡 Request to /auth/switch-role Auth header: present
4. ✅ Role switched successfully
5. ✅ Token set in axios
6. ✅ switchRole completed, redirecting to /my-wallet
7. 📍 Loading wallet for role: lojista  ← IMPORTANTE!
8. 👤 Full user object: { ..., activeRole: 'lojista', ... }
9. 📡 Request to /wallets/my-wallet/by-role/lojista Auth header: present
10. 💰 Wallet loaded: {
    owner: "storeId123",      ← STORE ID
    ownerType: "store",        ← STORE
    balance: X,               ← NÃO ZERO!
    totalIncome: X,
    history: [...]
   }
11. 🔔 ROLE CHANGED DETECTED: { activeRole: 'lojista' }
```

---

## ✅ Validação Final

Se todos esses logs aparecem **nesta ordem**, o fix funcionou! ✅

**Indicadores de sucesso:**
- [ ] Vê "🔔 ROLE CHANGED DETECTED" 
- [ ] Vê "Loading wallet for role: lojista"
- [ ] ownerType é "store" (não "user")
- [ ] owner é storeId (não userId)
- [ ] Balance não é 0 (se houver vendas)

---

## 🚀 Se ainda não funciona

### Teste 1: Verificar localStorage
```javascript
// Cole no console:
console.log(JSON.parse(localStorage.getItem('user')))

// Deve mostrar:
{
  id: 'userId',
  name: 'seu nome',
  activeRole: 'lojista',  // ← Deve ser 'lojista'
  storeId: 'storeId',     // ← Deve ter valor
  roles: ['lojista', 'cliente']
}
```

### Teste 2: Forçar recarregar
```javascript
// Cole no console:
location.reload()

// Depois mude de role novamente
```

### Teste 3: Limpar cache
```javascript
// Cole no console:
localStorage.clear()

// Fazer logout e login novamente
```

---

## 📝 Debug Avançado

### Se o wallet fica vazio mesmo após mudança:

```javascript
// Cole no console e procure por 'wallets' na resposta:
fetch('/wallets/my-wallet/by-role/lojista', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
}).then(r => r.json()).then(console.log)

// Deve retornar:
{
  _id: 'walletId',
  owner: 'storeId',
  ownerType: 'store',
  balance: X,
  totalIncome: X,
  history: [...]
}
```

---

## ✅ Resumo das Mudanças

| Arquivo | Mudança | Linha | Status |
|---------|---------|-------|--------|
| my-wallet.tsx | Adicionar debug console | ~26 | ✅ Feito |
| my-wallet.tsx | Resetar loading no useEffect | ~72 | ✅ Feito |
| my-wallet.tsx | Usar currentRole em dependency | ~77 | ✅ Feito |
| my-wallet.tsx | Adicionar user.role fallback | ~54 | ✅ Feito |

---

## 🎯 Próximos Passos

1. **Abra F12** e vá para Console
2. **Cole os logs** que vê quando muda de role
3. **Compare** com os logs esperados acima
4. **Se estiver diferente**, avisamos qual é o problema

---

**Status: ✅ MUDANÇAS APLICADAS, AGUARDANDO TESTES**
