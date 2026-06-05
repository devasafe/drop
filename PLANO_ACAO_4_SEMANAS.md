# 📋 PLANO DE AÇÃO - IMPLEMENTAÇÃO DAS MELHORIAS

**Documento de Planejamento para Próximas 4 Semanas**  
**Objetivo**: Elevar código de 7/10 para 9+/10

---

## 📅 SEMANA 1: Integração das Melhorias Criadas

### **Segunda-feira: Integração em app.ts**
**Tempo**: 2 horas  
**Responsável**: Dev

- [ ] Backup do app.ts atual
- [ ] Copiar estrutura de `EXEMPLO_APP_TS_ATUALIZADO.md`
- [ ] Testar se app inicia
- [ ] Testar rate limiting no Postman/curl
- [ ] Verificar logs criados em `logs/` folder

**Checklist:**
```bash
npm run dev
# Em outro terminal:
for i in {1..10}; do curl http://localhost:4000/api/health; done
# Deve limitar após 100 requisições
```

### **Terça-feira: Refatorar authController.ts**
**Tempo**: 4 horas  
**Responsável**: Dev

**Passos:**
1. [ ] Copiar padrão de `orderControllerRefactored.ts`
2. [ ] Adicionar `validate` middleware nas rotas
3. [ ] Refatorar `login` controller com logging
4. [ ] Refatorar `register` controller com transações
5. [ ] Refatorar outros métodos
6. [ ] Testar com Postman
7. [ ] Criar testes unitários

**Exemplo de checklist de refatoração:**

```typescript
// Antes de refatorar
src/routes/auth.ts:
router.post('/login', login);          // ❌ Sem validação, sem logging

// Depois de refatorar
src/routes/auth.ts:
router.post('/login', validate(LoginSchema), login);  // ✅ Com validação

src/controllers/authController.ts:
// ✅ Adicionar logging
log.operation('LOGIN', { email });
log.operationSuccess('LOGIN', { userId });

// ✅ Usar AppError
if (!user) throw new AuthenticationError('...');

// ✅ Tratamento padronizado
try { ... } catch (err) { if (err instanceof AppError) { ... } }
```

### **Quarta-feira: Refatorar productController.ts**
**Tempo**: 3 horas  
**Responsável**: Dev

- [ ] `createProduct` - adicionar validação + transação
- [ ] `updateProduct` - adicionar validação + logging
- [ ] `listProducts` - adicionar query validation
- [ ] Testes
- [ ] Documentar mudanças

### **Quinta-feira: Refatorar orderController.ts**
**Tempo**: 5 horas  
**Responsável**: Dev (esta é a mais crítica)

- [ ] `createOrder` - implementar com transações (já temos exemplo)
- [ ] `acceptOrder` - adicionar transações
- [ ] `cancelOrder` - adicionar validação
- [ ] Testes completos
- [ ] Validar rollback em erro

### **Sexta-feira: Testes e Documentação**
**Tempo**: 4 horas  
**Responsável**: Dev + QA

- [ ] Executar `npm test` - deve passar
- [ ] Testar fluxo completo: register → login → create order
- [ ] Testar rate limiting
- [ ] Verificar logs em `logs/`
- [ ] Documentar no changelog

**Checklist de Testes:**
```bash
npm test                           # Unit tests
npm run test:integration           # Integration tests (se existir)
npm run build                      # TypeScript compile

# Testes manuais
1. Registrar usuário (validar campos)
2. Login com senhas fracas (deve rejeitar)
3. Criar pedido sem autenticação (deve rejeitar)
4. Fazer > 100 requests em 15 min (deve rate limit)
5. Verificar logs estruturados
```

---

## 📅 SEMANA 2: Refatoração dos Controllers Restantes

### **Segunda-feira: Deliveries + Notifications**
**Tempo**: 4 horas

- [ ] `deliveryController.ts` - padrão refactored
- [ ] `notificationsController.ts` - padrão refactored
- [ ] Testes

### **Terça-feira: Stores + Categories**
**Tempo**: 4 horas

- [ ] `storeController.ts` - padrão refactored
- [ ] `categoryController.ts` - padrão refactored
- [ ] Testes

### **Quarta-feira: Gamification + Address + Uploads**
**Tempo**: 4 horas

- [ ] `gamificationController.ts`
- [ ] `addressController.ts`
- [ ] `uploadsController.ts`

### **Quinta-feira: User + Cancellation**
**Tempo**: 4 horas

- [ ] `userController.ts`
- [ ] `cancellationController.ts`
- [ ] Testes

### **Sexta-feira: Revisão + Testes Completos**
**Tempo**: 4 horas

- [ ] Code review de todas as mudanças
- [ ] Testes de integração completos
- [ ] Performance testing
- [ ] Documentar impacto

---

## 📅 SEMANA 3: Testes + Documentação

### **Segunda-feira: Aumentar Test Coverage**
**Tempo**: 8 horas

**Atual**: ~5/10  
**Meta**: 70%+

- [ ] Testes para validação (todos os schemas)
- [ ] Testes para rate limiting
- [ ] Testes para error handler
- [ ] Testes para logging

**Exemplo de teste:**
```typescript
describe('Validation Middleware', () => {
  it('should reject invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'invalid', password: 'Test123!' });
    
    expect(res.status).toBe(400);
    expect(res.body.error.errors[0].path).toBe('email');
  });
});
```

### **Terça-feira: Documentação com Swagger**
**Tempo**: 8 horas

**Meta**: 100% dos endpoints documentados

- [ ] Instalar swagger-jsdoc
- [ ] Adicionar @swagger comments em cada controller
- [ ] Validar em /api-docs
- [ ] Documentar schemas

### **Quarta-feira: Testes E2E**
**Tempo**: 8 horas

- [ ] Criar fluxo completo: register → login → order → payment → delivery
- [ ] Testar cancellation
- [ ] Testar error cases
- [ ] Documentar

### **Quinta-feira: Performance Testing**
**Tempo**: 8 horas

- [ ] Benchmark de requisições
- [ ] Teste de rate limiting sob carga
- [ ] Teste de logging performance
- [ ] Otimizações se necessário

### **Sexta-feira: Code Review + Bug Fix**
**Tempo**: 8 horas

- [ ] Revisar todo código refatorado
- [ ] Corrigir bugs encontrados
- [ ] Performance improvements
- [ ] Security review

---

## 📅 SEMANA 4: Polimento + Deployment

### **Segunda-feira: Índices MongoDB**
**Tempo**: 4 horas

- [ ] Adicionar índices nos models
- [ ] Testar performance
- [ ] Documentar

```typescript
// Em cada model:
UserSchema.index({ email: 1 });
OrderSchema.index({ customerId: 1, createdAt: -1 });
ProductSchema.index({ storeId: 1, category: 1 });
```

### **Terça-feira: CORS Seguro + Headers**
**Tempo**: 4 horas

- [ ] Configurar CORS com whitelist
- [ ] Adicionar security headers
- [ ] HTTPS enforcement

```typescript
app.use(cors({
  origin: ['https://drop.com', 'https://admin.drop.com'],
  credentials: true
}));

app.use(helmet()); // Security headers
```

### **Quarta-feira: CI/CD Setup**
**Tempo**: 4 horas

- [ ] GitHub Actions workflow
- [ ] Testes rodam no PR
- [ ] Build automático
- [ ] Deploy em staging

### **Quinta-feira: Deployment em Produção**
**Tempo**: 4 horas

- [ ] Testar em staging
- [ ] Deploy em produção
- [ ] Monitorar logs
- [ ] Rollback plan

### **Sexta-feira: Documentação Final + Retrospective**
**Tempo**: 4 horas

- [ ] CHANGELOG.md completo
- [ ] README.md atualizado
- [ ] Guia para novos devs
- [ ] Retrospective interna

---

## 🎯 Métricas de Sucesso

| Métrica | Antes | Depois | Meta |
|---------|-------|--------|------|
| Code Quality Score | 7/10 | ? | 9/10 |
| Test Coverage | 5% | ? | 70%+ |
| Type Safety | 8/10 | 9/10 | 9.5/10 |
| Error Handling | 6.5/10 | 9/10 | 9.5/10 |
| Logging | 5.5/10 | 8.5/10 | 9/10 |
| Security | 6.5/10 | 8.5/10 | 9/10 |
| Performance | 6/10 | 7.5/10 | 8.5/10 |

---

## 📦 Deliverables por Semana

### **Semana 1**
- ✅ app.ts integrado com rate limiting + error handler
- ✅ 3 controllers refatorados (auth, product, order)
- ✅ Testes básicos passando
- ✅ Logs estruturados funcionando

### **Semana 2**
- ✅ Todos os 13 controllers refatorados
- ✅ Validação em todos os endpoints
- ✅ Logging em operações críticas
- ✅ Transações em operações críticas

### **Semana 3**
- ✅ 70%+ test coverage
- ✅ Documentação com Swagger
- ✅ Testes E2E funcionando
- ✅ Performance benchmarks

### **Semana 4**
- ✅ Índices MongoDB adicionados
- ✅ Security hardening completo
- ✅ CI/CD pipeline pronto
- ✅ Deploy em produção
- ✅ Documentação final

---

## 💰 Estimativa de Esforço

| Item | Horas | Dias |
|------|-------|------|
| **Semana 1** | 22h | 3 dias |
| **Semana 2** | 20h | 2.5 dias |
| **Semana 3** | 32h | 4 dias |
| **Semana 4** | 16h | 2 dias |
| **TOTAL** | **90h** | **~2 semanas** |

---

## 🚀 Quick Win (Faça Hoje!)

Se você só tiver **1 dia**, faça isto:

```bash
# 1. Integrar rate limiting em app.ts (30 min)
cp EXEMPLO_APP_TS_ATUALIZADO.md src/app.ts
npm run dev

# 2. Refatorar authController (1h)
# Copiar padrão de orderControllerRefactored.ts

# 3. Testar tudo (30 min)
npm test
curl -H "Authorization: Bearer TOKEN" http://localhost:4000/api/orders

# Resultado: 
# ✅ Rate limiting ativado
# ✅ Logging estruturado
# ✅ Validação robusta
# ✅ Error handling padronizado
```

---

## 📞 Suporte

Se tiver dúvidas durante a implementação:

1. Consulte `GUIA_IMPLEMENTACAO_MELHORIAS.md`
2. Veja exemplo em `orderControllerRefactored.ts`
3. Consulte `EXEMPLO_APP_TS_ATUALIZADO.md`
4. Verifique testes em `src/tests/`

---

**Status**: 🟢 PRONTO PARA COMEÇAR  
**Próximo Passo**: Integrar em app.ts segunda-feira de manhã! 🚀
