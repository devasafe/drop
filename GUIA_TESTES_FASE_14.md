# 🧪 GUIA DE TESTES - FASE 14

**Data**: 2 de março de 2026

---

## 🎯 Objetivo

Validar que o sistema de comissões e planos funciona corretamente em todos os cenários.

---

## ✅ Pré-Requisitos

- [ ] Backend rodando em http://localhost:4000
- [ ] Frontend rodando em http://localhost:3000
- [ ] Banco de dados conectado
- [ ] Ter contas de:
  - [ ] CEO/Admin (para editar planos)
  - [ ] Lojista (para escolher plano)
  - [ ] Cliente (para fazer pedidos)
  - [ ] Motoboy (opcional)

---

## 🧪 Testes Funcionais

### Teste 1: Admin Edita Plano

**Objetivo**: Validar que admin consegue editar planos

**Passos**:
1. Login como CEO/Admin
2. Acessar http://localhost:3000/admin/pricing-config
3. Verificar que aparecem 3 planos:
   - [ ] Plano 1 (Marketplace Only)
   - [ ] Plano 2 (Marketplace + Motoboys)
   - [ ] Plano 3 (Premium)

4. Clicar em "Editar" no Plano 1
5. Alterar comissão de 0 para 5
6. Ver exemplo atualizar em tempo real:
   - [ ] Admin deveria receber: R$ 5 (ao invés de R$ 0)
   - [ ] Loja deveria receber: R$ 95 (ao invés de R$ 100)

7. Clicar em "Salvar"
8. Verificar mensagem: "Plano atualizado com sucesso!"
9. Recarregar página (F5)
10. Verificar que comissão ficou em 5%

**Resultado Esperado**: ✅ Plano editado com sucesso

---

### Teste 2: Admin Não Consegue Editar (Sem Permissão)

**Objetivo**: Validar que apenas CEO consegue editar

**Passos**:
1. Login como usuário comum (não CEO)
2. Acessar http://localhost:3000/admin/pricing-config
3. Tentar clicar "Editar"
4. Verificar erro: "Apenas CEO pode alterar planos"

**Resultado Esperado**: ✅ Acesso negado com mensagem clara

---

### Teste 3: Loja Escolhe Plano

**Objetivo**: Validar que lojista consegue escolher plano

**Passos**:
1. Login como lojista
2. Acessar http://localhost:3000/store/plan-selection
3. Verificar que aparecem 3 cards de planos:
   - [ ] Plano 1
   - [ ] Plano 2
   - [ ] Plano 3

4. Cada card deve mostrar:
   - [ ] Nome do plano
   - [ ] Sua comissão (%)
   - [ ] Exemplo de distribuição
   - [ ] Benefícios
   - [ ] Botão "Escolher este Plano"

5. Clicar "Escolher este Plano" no Plano 2
6. Verificar mensagem: "Plano alterado com sucesso!"
7. Ver badge: "✅ Seu Plano Atual" no Plano 2
8. Recarregar página (F5)
9. Badge deveria estar no Plano 2 (não mudar)

**Resultado Esperado**: ✅ Plano selecionado com sucesso

---

### Teste 4: Loja Muda de Plano

**Objetivo**: Validar que lojista consegue mudar de plano

**Passos**:
1. Lojista tem Plano 2 ativo
2. Clicar "Escolher este Plano" no Plano 3
3. Verificar mensagem: "Plano alterado com sucesso!"
4. Badge agora está em Plano 3
5. Plano 2 volta a mostrar: "Escolher este Plano"

**Resultado Esperado**: ✅ Plano mudado com sucesso

---

### Teste 5: Pedido com Plano 1 (0% comissão)

**Objetivo**: Validar distribuição com Plano 1

**Setup**:
- [ ] CEO em /admin/pricing-config
- [ ] Editar Plano 1: comissão = 0%
- [ ] Lojista em /store/plan-selection
- [ ] Selecionar Plano 1

**Passos**:
1. Cliente com saldo R$ 1000
2. Loja com saldo R$ 500
3. Admin com saldo R$ 10000

4. Cliente faz pedido de R$ 100
5. Sistema calcula:
   - Cliente deveria perder: R$ 100
   - Loja deveria ganhar: R$ 100 (100% - 0%)
   - Admin deveria ganhar: R$ 0 (0%)

6. Verificar saldos nas carteiras:
   - [ ] Cliente: R$ 1000 → R$ 900 ✅
   - [ ] Loja: R$ 500 → R$ 600 ✅
   - [ ] Admin: R$ 10000 → R$ 10000 ✅

7. Verificar histórico da loja:
   - [ ] Transação: "🛒 Pagamento" de R$ 100
   - [ ] Status: completed

**Resultado Esperado**: ✅ Distribuição correta (0% comissão)

---

### Teste 6: Pedido com Plano 2 (10% comissão)

**Objetivo**: Validar distribuição com Plano 2

**Setup**:
- [ ] Lojista seleciona Plano 2 (10% comissão)
- [ ] Reiniciar saldos:
  - Cliente: R$ 1000
  - Loja: R$ 500
  - Admin: R$ 10000

**Passos**:
1. Cliente faz pedido de R$ 100
2. Sistema calcula:
   - Cliente deveria perder: R$ 100
   - Loja deveria ganhar: R$ 90 (100% - 10%)
   - Admin deveria ganhar: R$ 10 (10%)

3. Verificar saldos:
   - [ ] Cliente: R$ 1000 → R$ 900 ✅
   - [ ] Loja: R$ 500 → R$ 590 ✅
   - [ ] Admin: R$ 10000 → R$ 10010 ✅

**Resultado Esperado**: ✅ Distribuição correta (10% comissão)

---

### Teste 7: Pedido com Plano 3 (20% comissão)

**Objetivo**: Validar distribuição com Plano 3

**Setup**:
- [ ] Lojista seleciona Plano 3 (20% comissão)
- [ ] Reiniciar saldos

**Passos**:
1. Cliente faz pedido de R$ 100
2. Sistema calcula:
   - Cliente deveria perder: R$ 100
   - Loja deveria ganhar: R$ 80 (100% - 20%)
   - Admin deveria ganhar: R$ 20 (20%)

3. Verificar saldos:
   - [ ] Cliente: R$ 1000 → R$ 900 ✅
   - [ ] Loja: R$ 500 → R$ 580 ✅
   - [ ] Admin: R$ 10000 → R$ 10020 ✅

**Resultado Esperado**: ✅ Distribuição correta (20% comissão)

---

### Teste 8: Mudança de Comissão Afeta Futuros Pedidos

**Objetivo**: Validar que mudança de plano afeta pedidos futuros

**Setup**:
- [ ] Lojista tem Plano 1 (0% comissão)
- [ ] Faz pedido de R$ 100 → Loja recebe R$ 100

**Passos**:
1. Admin edita Plano 1: comissão = 0% → 15%
2. Loja continua com Plano 1 (mudança de plano é global)
3. Cliente faz novo pedido de R$ 100
4. Sistema deveria calcular com 15% (comissão nova):
   - [ ] Loja recebe: R$ 85 (não R$ 100)
   - [ ] Admin recebe: R$ 15 (não R$ 0)

**Resultado Esperado**: ✅ Nova comissão aplicada em pedidos futuros

---

### Teste 9: Múltiplas Lojas com Planos Diferentes

**Objetivo**: Validar que cada loja tem seu próprio plano

**Setup**:
- [ ] Loja A seleciona Plano 1 (0%)
- [ ] Loja B seleciona Plano 3 (20%)

**Passos**:
1. Cliente 1 faz pedido na Loja A:
   - [ ] Loja A recebe R$ 100 (0% comissão)
   - [ ] Admin recebe R$ 0

2. Cliente 2 faz pedido na Loja B:
   - [ ] Loja B recebe R$ 80 (20% comissão)
   - [ ] Admin recebe R$ 20

**Resultado Esperado**: ✅ Cada loja respeita seu plano

---

### Teste 10: Responsividade

**Objetivo**: Validar que interfaces funcionam em diferentes tamanhos

**Admin - /admin/pricing-config**:
- [ ] Desktop (1920px): 3 colunas
- [ ] Tablet (768px): 2 colunas
- [ ] Mobile (375px): 1 coluna

**Loja - /store/plan-selection**:
- [ ] Desktop (1920px): 3 cards lado a lado
- [ ] Tablet (768px): 3 cards empilhados ou 2 + 1
- [ ] Mobile (375px): 1 card por vez

**Resultado Esperado**: ✅ Layout adapta corretamente

---

## 🐛 Testes de Edge Cases

### Teste 11: Plano Inválido

**Passos**:
1. Tentar fazer PUT /api/store/plan com planId inválido
2. Verificar erro: "Plano não encontrado"

**Resultado Esperado**: ✅ Erro apropriado

---

### Teste 12: Comissão Inválida

**Passos**:
1. Admin tenta editar plano com comissão = 150% (inválido)
2. Verificar validação no frontend
3. Se passar, backend deveria rejeitar

**Resultado Esperado**: ✅ Validação funciona

---

### Teste 13: Valor de Pedido Inválido

**Passos**:
1. Tentar criar pedido com valor negativo
2. Verificar erro apropriado

**Resultado Esperado**: ✅ Pedido rejeitado

---

## 📊 Testes de Performance

### Teste 14: Múltiplos Pedidos Simultâneos

**Objetivo**: Validar que sistema aguenta carga

**Setup**:
- [ ] 5 clientes prontos
- [ ] 1 loja com Plano 2

**Passos**:
1. Todos clientes fazem pedido ao mesmo tempo (ou quase)
2. Verificar que:
   - [ ] Todos pedidos foram criados
   - [ ] Saldos estão corretos
   - [ ] Nenhuma transação foi perdida
   - [ ] Não há race conditions

**Resultado Esperado**: ✅ Múltiplos pedidos processados corretamente

---

## ✅ Checklist Final

### Admin
- [ ] Consegue acessar /admin/pricing-config
- [ ] Consegue editar comissão
- [ ] Consegue editar taxes motoboy
- [ ] Exemplo atualiza em tempo real
- [ ] Consegue salvar mudanças
- [ ] Não consegue acessar sem ser CEO

### Loja
- [ ] Consegue acessar /store/plan-selection
- [ ] Consegue selecionar plano
- [ ] Consegue mudar de plano
- [ ] Badge mostra plano ativo
- [ ] Exemplo de distribuição está correto

### Pedidos
- [ ] Pedido com Plano 1 distribui corretamente (0%)
- [ ] Pedido com Plano 2 distribui corretamente (10%)
- [ ] Pedido com Plano 3 distribui corretamente (20%)
- [ ] Cliente saldo diminui ✅
- [ ] Loja saldo aumenta ✅
- [ ] Admin saldo aumenta ✅

### UI/UX
- [ ] Responsivo em desktop
- [ ] Responsivo em tablet
- [ ] Responsivo em mobile
- [ ] Mensagens de erro claras
- [ ] Estados de loading funcionam
- [ ] Validações visuais funcionam

### Segurança
- [ ] CEO consegue editar planos
- [ ] Não-CEO não consegue editar
- [ ] Lojista consegue escolher plano
- [ ] Não-lojista não consegue escolher
- [ ] Valores validados (0-100%)

---

## 📝 Relatório de Testes

Após completar todos os testes, documentar:

```
# Relatório de Testes - Fase 14

Data: ___/___/______
Testador: ____________

## Resumo
- Testes Executados: ___
- Testes Passaram: ___
- Testes Falharam: ___
- Taxa de Sucesso: ___%

## Testes Passaram
- [ ] Teste 1: Admin edita plano
- [ ] Teste 2: Sem permissão
- [ ] Teste 3: Loja escolhe plano
... etc

## Testes Falharam
- [ ] [Número]: Descrição do problema
  - Causa: ...
  - Solução: ...

## Issues Encontradas
1. ...
2. ...

## Aprovado? SIM / NÃO
Assinado: __________ Data: __/__/____
```

---

## 🚀 Após Testes

Se tudo passou:
1. ✅ Mergear código
2. ✅ Deploy em staging
3. ✅ Testes finais em staging
4. ✅ Deploy em produção
5. ✅ Monitoramento por 24h

Se algo falhou:
1. ❌ Documentar issue
2. ❌ Abrir issue no sistema
3. ❌ Corrigir no próximo sprint
4. ❌ Re-testar

---

**Bom teste!** 🎉
