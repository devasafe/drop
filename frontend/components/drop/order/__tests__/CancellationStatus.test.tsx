import { render, screen } from '@testing-library/react';
import { CancellationStatus } from '../CancellationStatus';

test('mostra motivo e reembolso', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'customer',
        reasonCode: 'customer_request',
        reason: 'Mudei de ideia',
        refundAmount: 40,
        refundStatus: 'processed',
        createdAt: new Date().toISOString(),
      }}
    />
  );
  expect(screen.getByText(/40,00/)).toBeInTheDocument();
});

test('mostra quem cancelou', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'store',
        reasonCode: 'not_available',
        reason: 'Sem estoque',
        createdAt: new Date().toISOString(),
      }}
    />
  );
  expect(screen.getByText('Rejeitado pela loja')).toBeInTheDocument();
});

test('mostra o label do motivo a partir do reasonCode', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'motoboy',
        reasonCode: 'delivery_failed',
        reason: 'Endereço não encontrado',
        createdAt: new Date().toISOString(),
      }}
    />
  );
  expect(screen.getByText('Falha na entrega')).toBeInTheDocument();
});

test('cai no motivo "Outro motivo" para reasonCode desconhecido', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'admin',
        reasonCode: 'codigo_inexistente',
        reason: 'Ajuste manual',
        createdAt: new Date().toISOString(),
      }}
    />
  );
  expect(screen.getByText('Outro motivo')).toBeInTheDocument();
});

test('mostra a taxa de cancelamento quando houver', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'customer',
        reasonCode: 'customer_request',
        reason: 'Mudei de ideia',
        cancellationFee: 5,
        createdAt: new Date().toISOString(),
      }}
    />
  );
  expect(screen.getByText(/5,00/)).toBeInTheDocument();
});

test('não mostra bloco de taxa quando não houver', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'customer',
        reasonCode: 'customer_request',
        reason: 'Mudei de ideia',
        createdAt: new Date().toISOString(),
      }}
    />
  );
  expect(screen.queryByText('Taxa de cancelamento')).not.toBeInTheDocument();
});

test('mostra aviso quando o reembolso falhou', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'customer',
        reasonCode: 'customer_request',
        reason: 'Mudei de ideia',
        refundAmount: 40,
        refundStatus: 'failed',
        createdAt: new Date().toISOString(),
      }}
    />
  );
  expect(screen.getByRole('alert')).toHaveTextContent(/erro ao processar o reembolso/i);
});

test('mostra o PIN de devolução quando presente', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'motoboy',
        reasonCode: 'delivery_failed',
        reason: 'Cliente ausente',
        createdAt: new Date().toISOString(),
        pinDevolucao: '654321',
      }}
    />
  );
  expect(screen.getByText('654321')).toBeInTheDocument();
});

test('não mostra bloco de PIN quando ausente', () => {
  render(
    <CancellationStatus
      cancellation={{
        cancelledBy: 'customer',
        reasonCode: 'customer_request',
        reason: 'Mudei de ideia',
        createdAt: new Date().toISOString(),
      }}
    />
  );
  expect(screen.queryByText('PIN de devolução')).not.toBeInTheDocument();
});
