# 📍 INTEGRAÇÃO FINAL: Adicionar Link na Navbar

## Localização da Navbar

Procure pelo arquivo de navbar do seu projeto. Tipicamente:
- `frontend/components/NavBar.tsx` ou
- `frontend/components/Navbar.tsx` ou
- `frontend/components/Navigation.tsx` ou
- `frontend/layouts/Layout.tsx`

## Código para Adicionar

Dentro do `useAuth()` ou onde estão os links do CEO, adicione:

```typescript
{/* 💳 CAIXA DO APP - APENAS PARA CEO */}
{(user?.role === 'ceo' || user?.activeRole === 'ceo') && (
  <a 
    href="/admin/app-cashbox"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      borderRadius: '6px',
      background: '#f0f0f0',
      color: '#333',
      textDecoration: 'none',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'background 0.2s',
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = '#e0e0e0'}
    onMouseLeave={(e) => e.currentTarget.style.background = '#f0f0f0'}
  >
    💳 Caixa do App
  </a>
)}
```

## Alternativa (se usar contexto)

```typescript
{user?.role === 'ceo' && (
  <button
    onClick={() => router.push('/admin/app-cashbox')}
    style={{
      background: '#667eea',
      color: 'white',
      border: 'none',
      padding: '8px 16px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '600',
    }}
  >
    💳 Caixa do App
  </button>
)}
```

## Ou com Dropdown Menu

Se a navbar tem menu dropdown para admin:

```typescript
<nav>
  {/* Outros links */}
  
  {user?.role === 'ceo' && (
    <div className="admin-menu">
      <a href="/admin/users">👥 Gerenciar Usuários</a>
      <a href="/admin/settings">⚙️ Configurações</a>
      <a href="/admin/app-cashbox">💳 Caixa do App</a>  {/* ← NOVO */}
    </div>
  )}
</nav>
```

## Após Adicionar

1. Faça rebuild do frontend:
```bash
npm run build
```

2. Reinicie o servidor:
```bash
npm start
```

3. Acesse como CEO e verifique se o link aparece na navbar

4. Clique para verificar se abre em `/admin/app-cashbox` corretamente

## Verificação

URL esperada: `http://localhost:3000/admin/app-cashbox`

Esperado:
- ✅ Página carrega com saldo
- ✅ Mostra tabs: Resumo | Extrato | Saques
- ✅ Botões: Depositar | Sacar
- ✅ Histórico de transações visível

---

**Próximo passo:** Integração completa com orderController e cancellationController
