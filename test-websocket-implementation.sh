#!/bin/bash

# 🚀 WEBSOCKET IMPLEMENTATION TEST SCRIPT
# Este script testa se todas as melhorias de Socket.IO foram implementadas corretamente

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔍 Iniciando verificação de implementação WebSocket...${NC}\n"

ERRORS=0
WARNINGS=0
SUCCESS=0

# ============= BACKEND CHECKS =============
echo -e "${YELLOW}📦 Verificando Backend...${NC}"

# 1. Verificar socketEmitter.ts
echo -n "✓ Verificando socketEmitter.ts... "
if grep -q "emitWalletUpdated" src/utils/socketEmitter.ts; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: emitWalletUpdated não encontrado${NC}"
  ((ERRORS++))
fi

# 2. Verificar app.ts inicializa Socket.IO
echo -n "✓ Verificando Socket.IO no app.ts... "
if grep -q "notifier.initSocket" src/index.ts; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}AVISO: initSocket não encontrado${NC}"
  ((WARNINGS++))
fi

# 3. Verificar orderController emite eventos
echo -n "✓ Verificando emits em orderController... "
if grep -q "emitOrderCreated" src/controllers/orderController.ts; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: emitOrderCreated não encontrado${NC}"
  ((ERRORS++))
fi

# 4. Verificar deliveryController emite eventos
echo -n "✓ Verificando emits em deliveryController... "
if grep -q "emitDeliveryAssigned" src/controllers/deliveryController.ts; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${YELLOW}AVISO: emitDeliveryAssigned pode não estar sendo usado${NC}"
  ((WARNINGS++))
fi

# ============= FRONTEND CHECKS =============
echo -e "\n${YELLOW}🎨 Verificando Frontend...${NC}"

# 5. Verificar useAutoRefetch hook
echo -n "✓ Verificando hook useAutoRefetch... "
if [ -f "frontend/hooks/useAutoRefetch.ts" ]; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: useAutoRefetch.ts não existe${NC}"
  ((ERRORS++))
fi

# 6. Verificar SocketContext.tsx
echo -n "✓ Verificando SocketContext.tsx... "
if grep -q "SocketProvider" frontend/contexts/SocketContext.tsx; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: SocketProvider não encontrado${NC}"
  ((ERRORS++))
fi

# 7. Verificar user-dashboard.tsx integrado
echo -n "✓ Verificando useAutoRefetch em user-dashboard... "
if grep -q "useAutoRefetch" frontend/pages/user-dashboard.tsx; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: useAutoRefetch não está integrado${NC}"
  ((ERRORS++))
fi

# 8. Verificar wallet.tsx integrado
echo -n "✓ Verificando useAutoRefetch em wallet... "
if grep -q "wallet:updated" frontend/pages/wallet.tsx; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: wallet:updated listener não encontrado${NC}"
  ((ERRORS++))
fi

# 9. Verificar motoboy/ongoing.tsx integrado
echo -n "✓ Verificando useAutoRefetch em motoboy/ongoing... "
if grep -q "delivery:assigned" frontend/pages/motoboy/ongoing.tsx; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: delivery:assigned listener não encontrado${NC}"
  ((ERRORS++))
fi

# 10. Verificar store-dashboard.tsx integrado
echo -n "✓ Verificando useAutoRefetch em store-dashboard... "
if grep -q "new_order" frontend/pages/store-dashboard.tsx; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: new_order listener não encontrado${NC}"
  ((ERRORS++))
fi

# ============= PACKAGE.JSON CHECKS =============
echo -e "\n${YELLOW}📋 Verificando Dependências...${NC}"

# 11. Verificar socket.io
echo -n "✓ Verificando socket.io... "
if grep -q '"socket.io"' package.json; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: socket.io não instalado${NC}"
  ((ERRORS++))
fi

# 12. Verificar socket.io-client
echo -n "✓ Verificando socket.io-client... "
if grep -q '"socket.io-client"' package.json; then
  echo -e "${GREEN}OK${NC}"
  ((SUCCESS++))
else
  echo -e "${RED}ERRO: socket.io-client não instalado${NC}"
  ((ERRORS++))
fi

# ============= SUMMARY =============
echo -e "\n${YELLOW}📊 RESUMO${NC}"
echo -e "  ${GREEN}✓ Sucesso: $SUCCESS${NC}"
echo -e "  ${YELLOW}⚠ Avisos: $WARNINGS${NC}"
echo -e "  ${RED}✗ Erros: $ERRORS${NC}"

if [ $ERRORS -eq 0 ]; then
  echo -e "\n${GREEN}🎉 Implementação WebSocket está COMPLETA!${NC}"
  echo -e "\n${YELLOW}Próximos passos:${NC}"
  echo "1. npm install (para instalar/atualizar dependências)"
  echo "2. npm run dev (no backend)"
  echo "3. npm run dev (no frontend)"
  echo "4. Abrir 2 abas no browser e testar criação de pedido em tempo real"
  exit 0
else
  echo -e "\n${RED}⚠️  Há ERROS que precisam ser corrigidos!${NC}"
  exit 1
fi
