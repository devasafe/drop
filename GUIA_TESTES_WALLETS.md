# 🧪 GUIA DE TESTES - SISTEMA DE WALLETS

**Data**: 28/02/2026  
**Status**: Pronto para testar  

---

## ⚙️ Setup Antes de Testar

### Backend
```bash
# Navegar até o diretório
cd d:/PROJETOS/Drop

# Instalar dependências (se necessário)
npm install

# Compilar TypeScript
npm run build

# Iniciar servidor
npm start

# Esperado: "✅ Servidor rodando em http://localhost:4000"
```

### Frontend
```bash
# Abrir outro terminal
cd d:/PROJETOS/Drop/frontend

# Instalar dependências (se necessário)
npm install

# Iniciar dev
npm run dev

# Esperado: "✅ App rodando em http://localhost:3000"
```

---

## 🧪 Testes por Página

### TEST 1: Carteira Cliente (/wallet)

#### 1.1 Carregar Saldo
```
PASSOS:
1. Abrir http://localhost:3000/wallet
2. Clicar em "💳 Carregar"
3. Inserir valor: 100.00
4. Selecionar: "📱 Pix"
5. Clicar "✅ Confirmar Carregamento"

ESPERADO:
✅ Saldo aumentou para R$ 100.00
✅ Transação aparece no histórico
✅ Mensagem: "✅ Saldo carregado com sucesso!"

VALIDAR:
□ GET /wallets/{userId} retorna balance: 100
□ Tabela histórico mostra "Carregamento"
□ Cores dos badges (verde para crédito)
```

#### 1.2 Histórico
```
PASSOS:
1. Clicar aba "📜 Histórico"
2. Verificar tabela com transações

ESPERADO:
□ Data formatada em pt-BR
□ Tipo com badge (verde=crédito, vermelho=débito)
□ Valor com sinais (+ ou -)
□ Descrição visível

VALIDAR:
□ Paginação funciona (limit=20)
□ Tabela zebra striping (alternância cores)
□ Hover effects funcionam
```

#### 1.3 Sacar
```
PASSOS:
1. Clicar aba "🏦 Sacar"
2. Inserir valor: 50.00
3. Preencher dados bancários:
   - Banco: Banco do Brasil
   - Agência: 1234
   - Conta: 12345678
   - CPF: 12345678901
4. Clicar "✅ Solicitar Saque"

ESPERADO:
✅ Saldo diminuiu de 100 para 50
✅ Transação "Saque" aparece no histórico
✅ Mensagem: "✅ Saque solicitado com sucesso!"

VALIDAR:
□ POST /wallets/{userId}/transfer funcionou
□ Validação de campos obrigatórios
□ Máximo = saldo disponível
□ Erro se preencher mal (mostra mensagem)
```

#### 1.4 Aviso de Saldo Insuficiente
```
PASSOS:
1. Tentar sacar R$ 100 (tendo R$ 50)
2. Ver mensagem de erro

ESPERADO:
✅ Mensagem: "Saldo insuficiente"
✅ Campo volta a zero
✅ Botão fica desabilitado

VALIDAR:
□ Validação frontend (input max)
□ Validação backend (Zod schema)
□ Mensagem clara
```

---

### TEST 2: Carteira Loja (/seller/wallet)

#### 2.1 Visualizar Saldo
```
PASSOS:
1. Login como lojista
2. Abrir http://localhost:3000/seller/wallet
3. Verificar informações exibidas

ESPERADO:
□ Saldo da loja visible
□ Plano exibido (1, 2, ou 3)
□ Taxa de comissão mostrada
□ % retido calculado corretamente

VALIDAR:
□ GET /wallets/store/{storeId} funcionando
□ Se plano=2 → 80% retido (taxa 20%)
□ Se plano=3 → 70% retido (taxa 30%)
□ Gradiente verde renderizando
```

#### 2.2 Histórico de Vendas
```
PASSOS:
1. Clicar aba "📜 Histórico"
2. Procurar vendas recentes

ESPERADO:
□ Transações "Venda" com crédito
□ Valores corretos (80% do total)
□ Datas formatadas
□ Descrição "Venda pedido #..."

VALIDAR:
□ Tabela renderiza corretamente
□ Ordem decrescente (recentes primeiro)
□ Valores batem com wallet distribution
```

#### 2.3 Análises
```
PASSOS:
1. Clicar aba "📊 Análises"
2. Verificar métricas exibidas

ESPERADO:
□ Média por dia: totalIncome / 30
□ Taxa atual: 20% (exemplo)
□ Você retém: 80% (correto)
□ Botão "Ver Detalhes do Plano"

VALIDAR:
□ Cálculos matemáticos corretos
□ Texto explicativo claro
□ Botão clickável (pode expandir depois)
```

---

### TEST 3: Carteira Motoboy (/motoboy/wallet)

#### 3.1 Visualizar Ganhos
```
PASSOS:
1. Login como motoboy
2. Abrir http://localhost:3000/motoboy/wallet
3. Verificar saldo e ganhos

ESPERADO:
□ Saldo disponível visível
□ Total ganho no mês
□ Ganho médio por entrega
□ Cor laranja renderizando

VALIDAR:
□ GET /wallets/{userId} retorna dados corretos
□ Cálculos: R$7 + distância + bônus rating
□ Histórico mostra "Ganho" (créditos)
```

#### 3.2 Benefícios
```
PASSOS:
1. Clicar aba "🎁 Benefícios"
2. Verificar entregas grátis e desconto

ESPERADO:
□ Entregas Grátis: X vezes
□ Desconto: Y%
□ Cards com cores diferentes

VALIDAR:
□ Dados vêm do wallet.freeDeliveriesAvailable
□ Dados vêm do wallet.discountPercentage
□ Descrição explicativa clara
```

#### 3.3 Sacar
```
PASSOS:
1. Clicar aba "🏦 Sacar"
2. Inserir valor: 100.00
3. Preencher dados bancários
4. Clicar "✅ Solicitar Saque"

ESPERADO:
✅ Saque solicitado com sucesso
✅ Histórico atualiza com "Saque"
✅ Saldo diminui

VALIDAR:
□ POST /wallets/{userId}/transfer funcionando
□ Validação de campos completos
□ Mensagem confirmando 2 dias úteis
```

---

### TEST 4: Dashboard CEO (/admin/dashboard)

#### 4.1 KPIs Principais
```
PASSOS:
1. Login como CEO
2. Abrir http://localhost:3000/admin/dashboard
3. Verificar 5 cards exibidos

ESPERADO:
□ Card 1: Saldo Plataforma (gradiente azul)
□ Card 2: Receita Total (gradiente verde)
□ Card 3: Usuários Ativos (gradiente ouro)
□ Card 4: Lojas Ativas (gradiente rosa)
□ Card 5: Motoboys Ativos (gradiente cyan)

VALIDAR:
□ GET /wallets/platform/metrics retorna dados
□ Cores dos gradientes corretas
□ Valores são numbers (não strings)
□ Sombras renderizando
```

#### 4.2 Gráfico de Barras
```
PASSOS:
1. Verificar seção "📈 Histórico de Receitas"
2. Pairar mouse sobre barras
3. Clicar em diferentes barras

ESPERADO:
□ 7 barras (últimos 7 dias)
□ Altura proporcional ao valor
□ Hover: altura aumenta
□ Cores alternadas (crédito=verde, débito=vermelho)
□ Datas em pt-BR (seg, ter, qua...)

VALIDAR:
□ Cálculo de altura correto
□ Animação de hover smooth
□ Tooltip ou título mostrando valor
□ Responsive em mobile
```

#### 4.3 Filtro de Período
```
PASSOS:
1. Clicar select no topo direito
2. Selecionar "Esta Semana"
3. Verificar mudanças
4. Tentar outros períodos

ESPERADO:
□ "Esta Semana": últimos 7 dias
□ "Este Mês": últimos 30 dias
□ "Este Ano": últimos 365 dias
□ "Tudo": histórico completo

VALIDAR:
□ Gráfico atualiza
□ KPIs atualizam
□ Contagem correta de dias
□ Histórico filtra corretamente
```

#### 4.4 Últimas Transações
```
PASSOS:
1. Scroll para tabela "🔄 Últimas Transações"
2. Verificar transações listadas

ESPERADO:
□ Tabela com últimas 10 transações
□ Data, tipo, valor, descrição
□ Badges coloridos (crédito/débito)
□ Zebra striping na tabela

VALIDAR:
□ Ordem decrescente (recentes primeiro)
□ Valores batem com cálculos
□ Descrições fazem sentido
□ Responsive em mobile
```

---

### TEST 5: Checkout Integrado (/checkout)

#### 5.1 Aviso de Saldo OK
```
PASSOS:
1. Carregar carteira com R$ 500
2. Ir ao checkout
3. Adicionar produtos por R$ 200
4. Calcular taxa (R$ 7 + distância)
5. Total = R$ 217
6. Ver aviso de saldo

ESPERADO:
□ Aviso mostra: "💰 Saldo: R$ 500.00"
□ Fundo verde (#dcfce7)
□ Texto: "✅ Saldo suficiente"

VALIDAR:
□ GET /wallets/{userId} executado ao abrir
□ Valor atualiza em tempo real
□ Cálculo de total correto
```

#### 5.2 Aviso de Saldo Baixo
```
PASSOS:
1. Carregar carteira com R$ 100
2. Ir ao checkout com produtos por R$ 200
3. Ver aviso de saldo

ESPERADO:
□ Aviso mostra: "💰 Saldo: R$ 100.00"
□ Fundo vermelho (#fee2e2)
□ Texto: "⚠️ Saldo insuficiente"
□ Mostra quanto falta: "R$ 117.00"
□ Botão "Finalizar" BLOQUEADO

VALIDAR:
□ Cálculo de diferença correto
□ Botão fica disabled
□ Clique no botão mostra alert
□ Alert informa saldo insuficiente
```

#### 5.3 Finalizar Pedido
```
PASSOS:
1. Com saldo OK, clicar "✓ Finalizar Pedido"
2. Modal de confirmação abre
3. Verificar valores no modal
4. Clicar "✅ Confirmar Pedido"

ESPERADO:
✅ Pedido criado com sucesso
✅ Saldo deduzido
✅ Redirecionado para /store-order/{id}
✅ Histórico atualiza

VALIDAR:
□ POST /orders executado com idempotentKey
□ Distribuição wallet correta
□ Cliente débita
□ Loja credita
□ CEO credita
□ Transação atômica (tudo ou nada)
```

#### 5.4 Validações
```
PASSOS:
1. Tentar finalizar sem endereço
2. Tentar finalizar sem saldo
3. Duplo clique no botão "Finalizar"

ESPERADO:
□ Sem endereço: Alert "Preencha endereço"
□ Sem saldo: Alert "Saldo insuficiente"
□ Duplo clique: Apenas 1 requisição
□ Botão muda para "⏳ Processando..."
□ Bloqueia novos cliques enquanto processa

VALIDAR:
□ Validações frontend
□ Prevenção de race condition
□ Loading state visual
□ Mensagens claras
```

---

## 📊 Teste de Distribuição de Valores

### Scenario: Cliente compra com Plano 2 (20% taxa)

```
SETUP:
- Cliente: R$ 500 na carteira
- Loja: Plano 2 (20% comissão)
- Pedido: Produtos R$ 200 + Entrega R$ 17 = TOTAL R$ 217

OPERAÇÃO:
- Cliente clica "Finalizar Pedido"
- Sistema distribui valores

ESPERADO:
- Cliente paga: R$ 217
- Cliente novo saldo: R$ 500 - R$ 217 = R$ 283 ✅
- Loja recebe: R$ 217 × 80% = R$ 173.60 ✅
- CEO recebe: R$ 217 × 20% = R$ 43.40 ✅

VERIFICAÇÃO:
1. Abrir /wallet (cliente)
   - Saldo = R$ 283 ✅
   - Histórico = "Pedido criado -217" ✅

2. Abrir /seller/wallet (loja)
   - Saldo += R$ 173.60 ✅
   - Histórico = "Venda +173.60" ✅

3. Abrir /admin/dashboard (CEO)
   - Saldo += R$ 43.40 ✅
   - Histórico = "Venda +43.40" ✅

TOTAL VALIDAÇÃO:
□ 283 + 173.60 + 43.40 = 500 ✅ (balanceado)
□ Percentuais corretos
□ Históricos consistentes
□ Transação atômica funcionou
```

---

## 🔄 Teste de Erro e Rollback

```
SETUP:
- Cliente: R$ 100 (saldo baixo)
- Pedido: R$ 217 (saldo insuficiente)

OPERAÇÃO:
- Cliente tenta finalizar pedido

ESPERADO:
- Sistema verifica saldo
- Detecta insuficiência
- Mostra alert
- NÃO cria pedido
- Saldo permanece R$ 100

VERIFICAÇÃO:
□ Alert mostra: "Saldo insuficiente"
□ Pedido NÃO criado no banco
□ Saldo NÃO alterado
□ Histórico NÃO possui "Pedido"
□ Nenhuma carteira foi creditada
```

---

## 📱 Teste Responsividade

```
Desktop (1920x1080):
□ Grid 2 colunas lado a lado
□ Tabelas com scroll horizontal
□ Cards grandes bem espaçados
□ Botões com tamanho confortável

Tablet (768x1024):
□ Grid 1 coluna
□ Cards empilhados
□ Buttons 100% width
□ Scroll vertical funciona

Mobile (375x667):
□ Stack vertical único
□ Inputs 100% width
□ Buttons tocáveis (44px+)
□ Tabelas com scroll horizontal
□ Gráfico adaptado
```

---

## 🔒 Teste de Segurança

```
□ Sem token JWT: Acesso negado
□ Token expirado: Redirecionado para login
□ Cliente acessa /seller/wallet: Bloqueado
□ Lojista acessa /wallet (cliente): Bloqueado
□ Motoboy acessa /admin/dashboard: Bloqueado
□ CEO acessa /wallet: Permitido (admin)

VALIDAR:
- ProtectedRoute bloqueando acesso
- RedirectTo login quando necessário
- required_role verificado corretamente
```

---

## 📈 Teste de Performance

```
□ Carregar /wallet: < 2s
□ Carregar histórico (20 itens): < 1s
□ Enviar formulário: < 1s
□ Dashboard carregar: < 2s
□ Gráfico animar: smooth 60fps
□ Sem memory leaks
```

---

## ✅ Checklist de Testes

- [ ] TEST 1: Carteira Cliente (Carregar, Histórico, Sacar)
- [ ] TEST 2: Carteira Loja (Saldo, Histórico, Análises)
- [ ] TEST 3: Carteira Motoboy (Ganhos, Benefícios, Sacar)
- [ ] TEST 4: Dashboard CEO (KPIs, Gráfico, Filtro, Histórico)
- [ ] TEST 5: Checkout (Aviso, Finalizar, Validações)
- [ ] Teste de Distribuição de Valores
- [ ] Teste de Erro e Rollback
- [ ] Teste Responsividade (Desktop, Tablet, Mobile)
- [ ] Teste de Segurança (Acesso, Permissões)
- [ ] Teste de Performance (Velocidade, Memory)

---

## 🐛 Debugging

### Browser DevTools
```
1. F12 → Console
   - Ver erros
   - Ver logs (console.log)

2. Network tab
   - Verificar requisições
   - Status HTTP
   - Response JSON

3. Application tab
   - localStorage
   - sessionStorage
   - Cookies
```

### Postman (Backend)
```
GET  http://localhost:4000/wallets/{userId}
     Headers: Authorization: Bearer {token}

POST http://localhost:4000/wallets/{userId}/credit
     Body: { amount: 100, paymentMethod: "pix", reference: "test" }

Etc...
```

---

**Criado em**: 28/02/2026  
**Versão**: 1.0  
**Próximo**: Executar testes e reportar bugs

