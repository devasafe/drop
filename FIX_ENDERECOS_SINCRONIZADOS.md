# 🔧 FIX: Sincronizar Endereços - Dashboard vs Checkout

**Data**: 12/03/2026  
**Problema**: Motoboy recebe endereço errado (Rua Antônio Pinto Bacalhau) em vez do endereço do checkout  
**Causa**: O endereço do checkout não estava sendo salvo como `mainAddress` do usuário

---

## 📋 Diagnóstico

### O Problema
1. **Checkout**: Permite adicionar/selecionar 3 endereços
2. **Dashboard**: Mostra lista vazia de endereços
3. **Resultado**: Motoboy vê `customer.mainAddress` (atual) em vez de `delivery.customerAddress` (snapshot)

### A Causa Raiz
```
Fluxo antigo (ERRADO):
Checkout → POST /orders com address (string)
         ↓
Order.customerAddress = "string" 
         ↓
deliveryController.getDelivery() → retorna customer.mainAddress
         ↓
Motoboy vê endereço errado!
```

---

## ✅ Solução Implementada

### 1️⃣ Backend - addressController.ts

**Adicionado suporte a `setAsDefault` no `addAddress()`:**

```typescript
export const addAddress = async (req: AuthenticatedRequest, res: Response) => {
  // ...
  const { label, street, ..., setAsDefault } = req.body;  // ✅ NOVO
  
  const newAddress = { label, street, ... };
  user.addresses.push(newAddress);
  
  // ✅ NOVO: Se setAsDefault=true, marcar como padrão
  if (setAsDefault) {
    user.mainAddress = newAddress;
  }
  
  return res.status(201).json({ 
    addresses: user.addresses, 
    mainAddress: user.mainAddress  // ✅ NOVO
  });
};
```

**Benefício**: Quando você adiciona um endereço, pode marcar como padrão na mesma requisição.

---

### 2️⃣ Frontend - user-dashboard.tsx

**Adicionado checkbox "Usar como padrão":**

```tsx
{/* ✅ NOVO: Checkbox para marcar como padrão */}
<div style={{...}}>
  <input
    type="checkbox"
    id="setAsDefault"
    checked={addressForm.setAsDefault || false}
    onChange={(e) => setAddressForm({ ...addressForm, setAsDefault: e.target.checked })}
  />
  <label htmlFor="setAsDefault">⭐ Usar como endereço padrão</label>
</div>
```

**Atualizado submit para enviar flag:**

```tsx
const payload = { ...addressForm, cep: addressForm.zip, setAsDefault };
const res = await api.post('/addresses', payload);

// ✅ Atualizar user.mainAddress se foi marcado como padrão
if (res.data.mainAddress && setUser) {
  setUser((prev) => ({ ...prev, mainAddress: res.data.mainAddress }));
}
```

---

### 3️⃣ Frontend - checkout.tsx

**Atualizado `onAdd` para marcar automaticamente como padrão:**

```tsx
onAdd={async addr => {
  try {
    // ✅ NOVO: Marcar como padrão quando adicionar no checkout
    const res = await api.post('/addresses', { ...addr, setAsDefault: true });
    setAddresses(res.data.addresses || []);
    alert('Endereço salvo e marcado como padrão!');
  } catch (e) {
    // ...
  }
}}
```

**Lógica**: Quando você adiciona um novo endereço no checkout, ele já vira o padrão automaticamente.

---

### 4️⃣ Fluxo Corrigido - deliveryController.ts

**Já foi corrigido antes, mas para referência:**

```typescript
// ANTES (ERRADO):
deliveryAddress: customerObj?.mainAddress ? `...` : '-',
deliveryLat: customerObj?.mainAddress?.latitude,
deliveryLng: customerObj?.mainAddress?.longitude

// DEPOIS (CORRETO):
deliveryAddress: delivery.customerAddress || (customerObj?.mainAddress ? ... : '-'),
deliveryLat: delivery.customerLatitude ?? (customerObj?.mainAddress?.latitude),
deliveryLng: delivery.customerLongitude ?? (customerObj?.mainAddress?.longitude)
```

---

## 🎯 Novo Fluxo (CORRETO)

```
OPÇÃO 1: Selecionar endereço existente
  Dashboard → Adicionar endereço + ✅ Marcar como padrão
  ↓
  user.addresses = [addr1, addr2, addr3, ...]
  user.mainAddress = addr3
  ↓
  Checkout → usa user.mainAddress ou seleciona outro
  ↓
  POST /orders → Order.customerAddress = "Rua X, 123..."
  ↓
  createDelivery() → delivery.customerAddress = "Rua X, 123..."
  ↓
  getDelivery() → retorna delivery.customerAddress ✅
  ↓
  Motoboy vê endereço CORRETO!

OPÇÃO 2: Adicionar novo endereço no Checkout
  Checkout → "Novo Endereço" → Preencher dados
  ↓
  POST /addresses → { ..., setAsDefault: true } ✅
  ↓
  user.addresses.push() + user.mainAddress = novo
  ↓
  Order.customerAddress = novo
  ↓
  Delivery.customerAddress = novo
  ↓
  Motoboy vê endereço CORRETO!
```

---

## 📝 Arquivos Alterados

| Arquivo | Mudanças |
|---------|----------|
| `src/controllers/addressController.ts` | Adicionado suporte a `setAsDefault` em `addAddress()` |
| `frontend/pages/user-dashboard.tsx` | Adicionado checkbox + atualizado submit |
| `frontend/pages/checkout.tsx` | Atualizado `onAdd` para enviar `setAsDefault: true` |
| `src/controllers/deliveryController.ts` | ✅ Já corrigido (usa `delivery.customerAddress` primeiro) |

---

## 🧪 Teste Manual

### Cenário 1: Dashboard
1. Ir em `/user-dashboard`
2. Tab "📍 Endereços"
3. Clicar em "➕ Novo Endereço"
4. Preencher formulário + marcar "⭐ Usar como padrão"
5. Clicar "✓ Salvar"
6. Verificar se:
   - ✅ Endereço aparece na lista
   - ✅ Tem badge "✓ Padrão"
   - ✅ `user.mainAddress` foi atualizado

### Cenário 2: Checkout
1. Ir em `/checkout`
2. Clique em "Novo Endereço"
3. Preencher dados
4. Clicar "Salvar Endereço"
5. Verificar se:
   - ✅ Endereço é salvo
   - ✅ Mensagem: "Endereço salvo e marcado como padrão!"
   - ✅ Endereço aparece no combo de seleção

### Cenário 3: Motoboy (O Principal!)
1. Fazer checkout com novo endereço
2. Ir em `/motoboy/delivery/[id]`
3. Verificar se:
   - ✅ Mostra endereço CORRETO (do checkout, não do mainAddress)
   - ✅ Mapa renderiza com coordenadas certas
   - ✅ Rota de entrega aparece

---

## 🚀 Próximos Passos

- [ ] Testar mapa renderizando no motoboy
- [ ] Verificar se rota está correta
- [ ] Validar idempotência (POST /orders)

---

## 💡 Observações

### Por que isso funciona?
1. **Sincronização**: Dashboard e Checkout agora usam o mesmo array `user.addresses`
2. **Snapshot**: Order salva cópia (snapshot) do endereço no momento do pedido
3. **Entrega**: Delivery copia campos do Order, não usa `customer.mainAddress` atual
4. **Motoboy**: Recebe dados corretos via `delivery.customerAddress`

### Segurança
- Order é imutável (snapshot no momento da criação)
- Motoboy vê exatamente o que cliente escolheu no checkout
- Se cliente mudar mainAddress depois, não afeta entregas antigas

---

**Status**: ✅ IMPLEMENTADO E TESTÁVEL

