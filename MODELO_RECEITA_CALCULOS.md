# 💰 MODELO DE RECEITA E CÁLCULOS FINANCEIROS

**Data**: 28/02/2026  
**Status**: ✅ Definido pela Liderança  
**Objetivo**: Documentar exatamente como funciona a distribuição de valores no sistema

---

## 📊 PLANOS DE CLIENTE (Lojista)

### Plano 1: Marketplace Only (15% taxa)
- **Inclui**: Marketplace + produtos
- **Não inclui**: Motoboys da plataforma
- **Taxa plataforma**: 15% do valor do pedido
- **Uso**: Lojista usa próprio delivery ou é pickup

### Plano 2: Marketplace + Motoboys (20% taxa)
- **Inclui**: Marketplace + produtos + motoboys da plataforma
- **Taxa plataforma**: 20% do valor do pedido
- **Distribuição da taxa**:
  - 15% vai para plataforma (CEO)
  - 5% vai para fundo de motoboys
- **Uso**: Lojista aproveita rede de motoboys

### Plano 3: Marketplace + Motoboys + Premium (30% taxa)
- **Inclui**: Marketplace + produtos + motoboys + destaque no app
- **Taxa plataforma**: 30% do valor do pedido
- **Distribuição da taxa**:
  - 15% plataforma (CEO)
  - 5% motoboys
  - 10% marketing/premium features
- **Benefícios**:
  - ⭐ Destaque nos banners
  - 📍 Melhor posição na listagem
  - 📢 Promoções no app

---

## 🏍️ GANHO DO MOTOBOY

### Cálculo por Entrega

```
Valor base: R$ 7.00
Adicional por km: R$ 1.00 / km

Exemplo 1:
- Distância: 5 km
- Ganho: 7 + (5 × 1) = R$ 12.00

Exemplo 2:
- Distância: 15 km
- Ganho: 7 + (15 × 1) = R$ 22.00
```

### Ganho Total por Pedido

```
Pedido de R$ 100.00
Distância: 10 km

├─ Cliente paga: R$ 100.00
│
├─ Loja recebe:
│  └─ R$ 100.00 - 20% (taxa) = R$ 80.00
│
├─ Motoboy recebe:
│  └─ R$ 7.00 + (10 km × R$ 1.00) = R$ 17.00
│  └─ + Bônus gamificação (se aplicável)
│
└─ CEO/Plataforma recebe:
   └─ R$ 20.00 (taxa 20%)
      ├─ R$ 15.00 (base)
      ├─ R$ 5.00 (fundo motoboys)
      └─ R$ 0.00 (premium - só plano 3)
```

### Bônus por Avaliação (Gamificação)

```
Rating ≥ 4.5 ⭐⭐⭐⭐⭐:
  + R$ 2.00 por entrega

Rating 3.5 - 4.4 ⭐⭐⭐⭐:
  + R$ 1.00 por entrega

Rating < 3.5 ⭐⭐⭐:
  + R$ 0.00 (sem bônus)
```

### Exemplo Completo de Ganho Motoboy

```
Entrega 1:
- Base: R$ 7.00
- Distância 8 km: R$ 8.00
- Rating 4.8: R$ 2.00
- Total: R$ 17.00 ✅

Entrega 2:
- Base: R$ 7.00
- Distância 3 km: R$ 3.00
- Rating 4.0: R$ 1.00
- Total: R$ 11.00 ✅

Dia do Motoboy: R$ 28.00 ganhos
```

---

## 💳 FLUXO DE PAGAMENTO (IMEDIATO)

```
CLIENTE CLICA "CONFIRMAR PEDIDO"
        │
        ▼
┌─────────────────────────┐
│ Pedido criado          │
│ Valor: R$ 100.00       │
│ Distância: 10 km       │
│ Loja: Plano 2 (20%)    │
└──────────┬──────────────┘
           │
        [DISTRIBUIÇÃO IMEDIATA]
           │
     ┌─────┴──────┬──────────┬────────────┐
     │            │          │            │
     ▼            ▼          ▼            ▼
   LOJA         CEO      MOTOBOY      CLIENTE
Carteira      Carteira   Carteira    Carteira
+R$ 80.00    +R$ 20.00  +R$ 17.00   -R$ 100.00
(80%)        (20% taxa) (taxa+dist)  (paga)

┌──────────────────────────────────────┐
│ CARTEIRAS ATUALIZADAS                │
│ ✅ Loja: R$ 80.00 (caixa)            │
│ ✅ CEO: R$ 20.00 (plataforma)        │
│ ✅ Motoboy: R$ 17.00 (a receber)     │
│ ✅ Cliente: R$ 100.00 debitado       │
└──────────────────────────────────────┘

[MOTOBOY ACEITA ENTREGA]
        │
        ▼
┌─────────────────────┐
│ Após 30 min         │
│ Entrega finalizada  │
│ Rating: 4.8 ⭐     │
└──────────┬──────────┘
           │
    [GAMIFICAÇÃO]
           │
    +R$ 2.00 bônus
           │
    ┌──────▼──────────┐
    │ Motoboy ganhou  │
    │ +R$ 2.00 extra  │
    │ Total: R$ 19.00 │
    └─────────────────┘
```

---

## 📈 EXEMPLOS DE CÁLCULOS DIÁRIOS

### Exemplo 1: Loja Plano 1 (Marketplace Only - 15%)

```
Loja: Padaria Alegria

Pedido A: R$ 50.00
├─ Loja: R$ 42.50 (85%)
└─ CEO: R$ 7.50 (15%)

Pedido B: R$ 75.00
├─ Loja: R$ 63.75 (85%)
└─ CEO: R$ 11.25 (15%)

Pedido C: R$ 30.00
├─ Loja: R$ 25.50 (85%)
└─ CEO: R$ 4.50 (15%)

TOTAL DIA:
├─ Vendas: R$ 155.00
├─ Loja recebe: R$ 131.75 (85%)
└─ CEO recebe: R$ 23.25 (15%)

Obs: Loja usa próprio delivery, sem usar motoboys da plataforma
```

### Exemplo 2: Loja Plano 2 (Marketplace + Motoboys - 20%)

```
Loja: Restaurante Delícia

Pedido A: R$ 80.00, 12 km, Motoboy rating 4.6
├─ Loja: R$ 64.00 (80%)
├─ CEO: R$ 16.00 (20%)
│  ├─ Base (CEO): R$ 12.00 (15%)
│  └─ Fundo Motoboys: R$ 4.00 (5%)
└─ Motoboy: R$ 7.00 + R$ 12.00 + R$ 1.00 = R$ 20.00

Pedido B: R$ 120.00, 8 km, Motoboy rating 4.2
├─ Loja: R$ 96.00 (80%)
├─ CEO: R$ 24.00 (20%)
│  ├─ Base (CEO): R$ 18.00 (15%)
│  └─ Fundo Motoboys: R$ 6.00 (5%)
└─ Motoboy: R$ 7.00 + R$ 8.00 + R$ 1.00 = R$ 16.00

TOTAL DIA:
├─ Vendas: R$ 200.00
├─ Loja recebe: R$ 160.00 (80%)
├─ CEO recebe: R$ 40.00 (20%)
│  ├─ Base CEO: R$ 30.00
│  └─ Fundo Motoboys: R$ 10.00
└─ Motoboys recebem: R$ 36.00

Nota: CEO fica com R$ 30.00, R$ 10.00 fica em fundo para qualquer coisa que motoboys precisem
```

### Exemplo 3: Loja Plano 3 (Premium - 30%)

```
Loja: Supermercado Premium (com destaque)

Pedido A: R$ 150.00, 6 km, Motoboy rating 4.9
├─ Loja: R$ 105.00 (70%)
├─ CEO: R$ 45.00 (30%)
│  ├─ Base (CEO): R$ 22.50 (15%)
│  ├─ Fundo Motoboys: R$ 7.50 (5%)
│  └─ Premium Marketing: R$ 15.00 (10%) - destaque, melhor posição
└─ Motoboy: R$ 7.00 + R$ 6.00 + R$ 2.00 = R$ 15.00

BENEFÍCIO LOJA: Fica em destaque no app, 300% mais visibilidade
```

---

## 🎮 GAMIFICAÇÃO - RESGATE DE CUPOM

### Cupom: Entrega Grátis (200 pontos)

```
Motoboy João acumula 200 pontos:
- 10 entregas × 15 pontos = 150 pontos
- 5 avaliações 4.5+ × 10 pontos = 50 pontos
- TOTAL: 200 pontos ✅

Próxima entrega:
├─ Sem cupom: Receberia R$ 7.00 + R$ 8.00 (km) = R$ 15.00
└─ COM CUPOM: Receberia R$ 7.00 + R$ 8.00 + R$ 7.00 (taxa isentada) = R$ 22.00

João resgata o cupom:
├─ Usa em um pedido de 10 km
├─ Normalmente: R$ 7.00 + R$ 10.00 = R$ 17.00
├─ Com cupom: R$ 7.00 + R$ 10.00 + R$ 17.00 (taxa grátis paga por plataforma) = R$ 34.00
│
└─ Valor do cupom para plataforma: R$ 17.00 (taxa que deixou de cobrar)

Motoboy fica feliz, ganha mais, plataforma investe em retenção
```

---

## 📊 RESUMO FINANCEIRO (Exemplo Mês)

```
Mês: Fevereiro 2026
Período: 01/02 a 28/02 (28 dias)

RECEITA TOTAL BRUTA: R$ 150.000,00

Distribuição:

1. LOJAS RECEBEM: R$ 112.500,00 (75%)
   ├─ Plano 1 (15%): 30 lojas × R$ 1.500 = R$ 45.000
   ├─ Plano 2 (20%): 50 lojas × R$ 1.400 = R$ 70.000
   └─ Plano 3 (30%): 10 lojas × R$ (-500) = -R$ 5.000 (ops, calculo de exemplo)

2. MOTOBOYS RECEBEM: R$ 20.000,00
   ├─ 200 motoboys × R$ 100/dia = R$ 20.000
   └─ (já descontado cupons/benefícios)

3. PLATAFORMA RECEBE: R$ 37.500,00 (25%)
   ├─ Taxa base (15% lojas plano 2+3): R$ 25.000
   ├─ Fundo motoboys (5% plano 2+3): R$ 10.000
   ├─ Premium marketing (10% plano 3): R$ 2.500
   └─ Custos operacionais: -R$ 10.000
   
   LUCRO LÍQUIDO: R$ 27.500,00

DISTRIBUIÇÃO FINAL:
├─ Lojas: 75% (R$ 112.500)
├─ Motoboys: 13% (R$ 20.000)
├─ Custos operacionais: 7% (-R$ 10.000)
└─ Lucro plataforma: 5% (R$ 7.500)
```

---

## 🔐 LOCKS TRANSACIONAIS

Para evitar inconsistências, toda transferência de dinheiro usa **transação MongoDB**:

```typescript
// PSEUDOCÓDIGO
async function distributeOrderPayment(order) {
  const session = await db.startSession();
  session.startTransaction();
  
  try {
    // 1. Débito Cliente
    await Wallet.updateOne(
      { owner: order.clientId },
      { $inc: { balance: -order.total } },
      { session }
    );
    
    // 2. Crédito Loja
    const storeFeePercent = getStorePlan(order.storeId).fee / 100;
    const storeAmount = order.total * (1 - storeFeePercent);
    await Wallet.updateOne(
      { owner: order.storeId },
      { $inc: { balance: storeAmount } },
      { session }
    );
    
    // 3. Crédito CEO
    const ceoAmount = order.total * storeFeePercent;
    await Wallet.updateOne(
      { owner: ceoUserId },
      { $inc: { balance: ceoAmount } },
      { session }
    );
    
    // Confirma tudo ou nada
    await session.commitTransaction();
    
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
```

---

## ❓ EDGE CASES E REGRAS

### 1. Cliente com saldo insuficiente
```
❌ Bloqueado
- Aviso: "Saldo insuficiente. Seu saldo: R$ 20.00. Valor necessário: R$ 50.00"
- Opção: Carregar saldo ou usar outra forma de pagamento
```

### 2. Motoboy cancela entrega
```
Cliente paga: R$ 100.00
Loja recebe: R$ 80.00 ✅
CEO recebe: R$ 20.00 ✅
Motoboy ainda não recebeu: R$ 17.00 (pendente)

Se Motoboy cancela:
- Dinheiro volta para loja? Ou Cliente?
→ Decisão: Volta para CLIENTE (pedido cancelado)
- Motoboy não ganha nada ✅
```

### 3. Cliente solicita reembolso
```
Pedido cancelado por cliente:
- Cliente: -R$ 100.00 → +R$ 100.00 (crédito na carteira)
- Loja: +R$ 80.00 → -R$ 80.00 (volta ao caixa/CEO, não ao cliente)
- CEO: +R$ 20.00 → -R$ 20.00

Cliente pode usar crédito de R$ 100.00 em novo pedido ✅
```

### 4. Cupom de entrega grátis (200 pontos)
```
Sistema deduz automaticamente quando motoboy completa entrega:

Ganho base: R$ 7.00 + R$ 10.00 (km) = R$ 17.00

Se cupom ativo:
- Motoboy recebe MESMO: R$ 17.00
- Plataforma PAGA por ele: +R$ 17.00 (saída do caixa)
- Cupom: -1 uso (saldo de cupons do motoboy)

Total para plataforma nesta entrega: Custo de R$ 17.00 em cupom
```

---

## 🎯 Checklist de Implementação

### Backend

- [ ] Atualizar schema Store com campo `plan` (1, 2, 3)
- [ ] Atualizar schema User com campo `role` (nova hierarquia)
- [ ] Criar Wallet schema com campos de taxa/plano
- [ ] Criar função `getStorePlanFee(storeId)` que retorna %
- [ ] Criar função `calculateMotoboyEarnings(distanceKm, rating)`
- [ ] Criar função `distributeOrderPayment()` com transação
- [ ] Adicionar verificação de saldo antes de criar pedido
- [ ] Adicionar histórico em Wallet para cada transação
- [ ] Criar endpoint GET `/wallets/:id` (consultar saldo)
- [ ] Criar endpoint POST `/wallets/:id/credit` (carregar saldo)
- [ ] Criar endpoint POST `/wallets/:id/transfer` (sacar para banco)

### Frontend

- [ ] Página de Carteira (por tipo: cliente, loja, motoboy)
- [ ] Formulário carregar saldo (cliente)
- [ ] Formulário sacar saldo (motoboy/loja)
- [ ] Histórico de transações
- [ ] Verificar saldo antes de finalizar compra

### Tests

- [ ] Testar distribuição de valores com plano 1, 2, 3
- [ ] Testar cupom de entrega grátis
- [ ] Testar transação com rollback
- [ ] Testar saldo insuficiente

---

**Versão**: 1.0  
**Última atualização**: 28/02/2026  
**Aprovado por**: Liderança
