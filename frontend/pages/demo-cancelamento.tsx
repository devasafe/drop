import React from 'react';

export default function CancelamentoDemo() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <h1>✓ Sistema de Cancelamento e Rejeição - Frontend</h1>
      
      <div style={{ backgroundColor: '#f0f9ff', border: '2px solid #0ea5e9', borderRadius: '8px', padding: '20px', marginBottom: '30px' }}>
        <h2>📍 Implementação nos Clientes</h2>
        <p>Os botões e modais de cancelamento/rejeição foram integrados nas seguintes páginas:</p>
      </div>

      {/* CLIENTE - CANCELAR PEDIDO */}
      <div style={{ backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h3>👤 Cliente - Cancelar Pedido</h3>
        <p><b>Página:</b> <code style={{backgroundColor: '#fff', padding: '2px 8px', borderRadius: '4px'}}>/order-[id]</code></p>
        <p><b>O que aparece:</b></p>
        <ul>
          <li>✓ Botão vermelho "Cancelar Pedido" quando pedido está em status: <code>criado</code>, <code>pago</code> ou <code>enviado</code></li>
          <li>✓ Modal "CancelOrderModal" com opções de motivo</li>
          <li>✓ Display de status de cancelamento quando pedido é cancelado</li>
        </ul>
        <p><b>Como funciona:</b></p>
        <ol>
          <li>Cliente clica no botão "✕ Cancelar Pedido"</li>
          <li>Modal abre com 5 opções de motivos (ou custom)</li>
          <li>Cliente seleciona motivo e confirma</li>
          <li>API POST <code>/orders/:id/cancel</code> é chamada</li>
          <li>Pedido muda para status "cancelado"</li>
          <li>Refund é processado automaticamente</li>
        </ol>
      </div>

      {/* LOJA - ACEITAR/REJEITAR PEDIDO */}
      <div style={{ backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h3>🏪 Loja - Aceitar/Rejeitar Pedido</h3>
        <p><b>Página:</b> <code style={{backgroundColor: '#fff', padding: '2px 8px', borderRadius: '4px'}}>/seller/order-[id]</code></p>
        <p><b>O que aparece:</b></p>
        <ul>
          <li>✓ Card "OrderActionsCard" quando pedido está em status: <code>criado</code></li>
          <li>✓ Botão verde "Aceitar Pedido" para aprovar</li>
          <li>✓ Botão vermelho "Rejeitar Pedido" com modal de motivo</li>
          <li>✓ Display de cancelamento quando rejeitado</li>
        </ul>
        <p><b>Como funciona:</b></p>
        <ol>
          <li>Loja vê card com 2 ações possíveis</li>
          <li>Ao clicar "Aceitar": POST <code>/orders/:id/accept</code> → status muda para "pago"</li>
          <li>Ao clicar "Rejeitar": Modal abre com 5 motivos</li>
          <li>Loja seleciona motivo e confirma</li>
          <li>POST <code>/orders/:id/reject</code> é chamada</li>
          <li>Pedido muda para "cancelado" com refund processado</li>
        </ol>
      </div>

      {/* MOTOBOY - REJEITAR ENTREGA */}
      <div style={{ backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h3>🚗 Motoboy - Rejeitar Entrega</h3>
        <p><b>Página:</b> <code style={{backgroundColor: '#fff', padding: '2px 8px', borderRadius: '4px'}}>/motoboy/delivery/[id]</code></p>
        <p><b>O que aparece:</b></p>
        <ul>
          <li>✓ Card "Rejeitar Entrega" quando entrega está em: <code>assigned</code> ou <code>picked</code></li>
          <li>✓ Botão vermelho "Rejeitar Entrega"</li>
          <li>✓ Modal "RejectDeliveryModal" com 3 steps (motivo → ação → confirmação)</li>
        </ul>
        <p><b>Como funciona:</b></p>
        <ol>
          <li>Motoboy clica botão "✕ Rejeitar Entrega"</li>
          <li>Modal Step 1: Seleciona motivo (5 opções + custom)</li>
          <li>Modal Step 2: Escolhe ação: <code>reassign</code> (volta ao pool) ou <code>cancel</code> (cancela completamente)</li>
          <li>Modal Step 3: Confirmação final</li>
          <li>POST <code>/deliveries/:id/reject</code> é chamada com action</li>
          <li>Se reassign: Entrega volta ao pool para outro motoboy aceitar</li>
          <li>Se cancel: Entrega é cancelada, pedido também fica cancelado, refund processado</li>
        </ol>
      </div>

      {/* COMPONENTES CRIADOS */}
      <div style={{ backgroundColor: '#f0fdf4', border: '2px solid #22c55e', borderRadius: '8px', padding: '20px', marginBottom: '30px' }}>
        <h2>📦 Componentes Frontend Criados</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
            <h4>CancelOrderModal.tsx</h4>
            <p style={{ fontSize: '13px', color: '#666' }}>Modal para cliente cancelar pedido</p>
            <code style={{ fontSize: '11px' }}>components/order/</code>
          </div>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
            <h4>OrderActionsCard.tsx</h4>
            <p style={{ fontSize: '13px', color: '#666' }}>Card com botões Aceitar/Rejeitar para loja</p>
            <code style={{ fontSize: '11px' }}>components/order/</code>
          </div>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
            <h4>RejectDeliveryModal.tsx</h4>
            <p style={{ fontSize: '13px', color: '#666' }}>Modal 3-step para motoboy rejeitar</p>
            <code style={{ fontSize: '11px' }}>components/delivery/</code>
          </div>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
            <h4>CancellationStatusDisplay.tsx</h4>
            <p style={{ fontSize: '13px', color: '#666' }}>Exibe histórico e status de cancelamento</p>
            <code style={{ fontSize: '11px' }}>components/order/</code>
          </div>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
            <h4>useCancellation.ts</h4>
            <p style={{ fontSize: '13px', color: '#666' }}>Hook com 6 funções para cancelamento</p>
            <code style={{ fontSize: '11px' }}>hooks/</code>
          </div>
          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
            <h4>Button.tsx + Modal.tsx</h4>
            <p style={{ fontSize: '13px', color: '#666' }}>Componentes comuns reutilizáveis</p>
            <code style={{ fontSize: '11px' }}>components/common/</code>
          </div>
        </div>
      </div>

      {/* FLUXО DE DADOS */}
      <div style={{ backgroundColor: '#fef3c7', border: '2px solid #eab308', borderRadius: '8px', padding: '20px' }}>
        <h2>🔄 Fluxo de Dados</h2>
        <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', overflow: 'auto' }}>
          <pre>{`
CLIENTE CANCELA PEDIDO:
┌─────────────────────────────────────┐
│ /order-[id]                          │
│ Button: "Cancelar Pedido"           │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ CancelOrderModal                    │
│ - Seleciona motivo                  │
│ - Confirma cancelamento             │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ useCancellation.cancelOrder()        │
│ POST /orders/:id/cancel             │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ BACKEND                             │
│ - Valida propriedade                │
│ - Cria db Cancellation              │
│ - Atualiza Order.status = cancelado │
│ - Processa refund                   │
│ - Emite socket events               │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ /order-[id]                          │
│ - Status muda para "cancelado"      │
│ - CancellationStatusDisplay mostra   │
│   histórico de cancelamento         │
└─────────────────────────────────────┘

LOJA REJEITA PEDIDO:
┌─────────────────────────────────────┐
│ /seller/order-[id]                   │
│ OrderActionsCard                    │
│ Button: "Rejeitar"                  │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Modal com motivos de rejeição       │
│ - Seleciona motivo                  │
│ - Confirma rejeição                 │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ useCancellation.rejectOrder()        │
│ POST /orders/:id/reject             │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ BACKEND                             │
│ - Valida propriedade da loja        │
│ - Cria db Cancellation              │
│ - Atualiza Order.status = cancelado │
│ - Processa refund                   │
│ - Cancela delivery associada        │
│ - Emite socket para cliente         │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ /seller/order-[id]                   │
│ - Status muda para "cancelado"      │
│ - CancellationStatusDisplay mostra   │
└─────────────────────────────────────┘

MOTOBOY REJEITA ENTREGA:
┌─────────────────────────────────────┐
│ /motoboy/delivery/[id]               │
│ Card: "Rejeitar Entrega"            │
│ Button: "Rejeitar"                  │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ RejectDeliveryModal - STEP 1: MOTIVO    │
│ - 5 opções predefinidas + custom        │
│ - Next → Step 2                         │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ RejectDeliveryModal - STEP 2: AÇÃO      │
│ - Opção 1: "Devolver ao Pool" (reassign)│
│ - Opção 2: "Cancelar Entrega" (cancel)  │
│ - Next → Step 3                         │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ RejectDeliveryModal - STEP 3: CONFIRMAÇÃO
│ - Resumo finalizado                     │
│ - Botão de conclusão                    │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ useCancellation.rejectDelivery()     │
│ POST /deliveries/:id/reject         │
│ payload: { reason, action }         │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ BACKEND                             │
│ Se action === "reassign":           │
│   - Entrega volta ao pool           │
│   - Fica disponível para motoboys   │
│ Se action === "cancel":             │
│   - Entrega é cancelada             │
│   - Order é cancelado               │
│   - Refund é processado             │
│ - Cria db Cancellation              │
│ - Emite socket events               │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ /motoboy/delivery/[id]               │
│ - Status atualizado                  │
│ - Se reassign: "available" novamente │
│ - Se cancel: "cancelled"             │
└─────────────────────────────────────┘
          `}</pre>
        </div>
      </div>

      <div style={{ backgroundColor: '#f0e7ff', border: '2px solid #a855f7', borderRadius: '8px', padding: '20px', marginTop: '30px' }}>
        <h2>✅ Status da Implementação</h2>
        <ul style={{ fontSize: '14px' }}>
          <li>✅ API Endpoints: Todos implementados no backend</li>
          <li>✅ Componentes Frontend: Criados e integrado</li>
          <li>✅ Hook useCancellation: Implementado com 6 funções</li>
          <li>✅ Modal e Button components: Criados em components/common</li>
          <li>✅ Integração em páginas: ✓ customer, ✓ seller, ✓ motoboy</li>
          <li>✅ Socket Events: 5 eventos de time-real implementados</li>
          <li>✅ Banco de dados: Modelo Cancellation criado</li>
          <li>✅ Autenticação: Rotas protegidas por roles</li>
          <li>✅ Testes: Backend testado com sucesso</li>
        </ul>
      </div>
    </div>
  );
}
