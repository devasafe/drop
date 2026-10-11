import { render, screen, fireEvent } from '@testing-library/react';
import { CancellationStatus } from '../CancellationStatus';

const base = { cancelledBy: 'store' as const, reasonCode: 'not_available', reason: 'Cabo esgotou', createdAt: '2026-09-01T10:14:00', refundAmount: 39.9 };

it('custódia: "Seu dinheiro está voltando", linha do tempo do estorno e as saídas', () => {
  const onSupport = jest.fn(); const onBuyElsewhere = jest.fn();
  render(<CancellationStatus cancellation={{ ...base, refundStatus: 'pending' }} paymentMethod="pix" onSupport={onSupport} onBuyElsewhere={onBuyElsewhere} />);
  expect(screen.getByText('Seu dinheiro está voltando')).toBeInTheDocument();
  expect(screen.getByText('Estorno de R$ 39,90')).toBeInTheDocument();
  expect(screen.getByText('Estorno pedido ao banco')).toBeInTheDocument();
  expect(screen.getByText('Dinheiro na sua conta')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Comprar em outra loja/ }));
  fireEvent.click(screen.getByRole('button', { name: /Falar com o suporte/ }));
  expect(onBuyElsewhere).toHaveBeenCalled(); expect(onSupport).toHaveBeenCalled();
});

it('custódia processado: estorno concluído', () => {
  render(<CancellationStatus cancellation={{ ...base, refundStatus: 'processed' }} />);
  expect(screen.getByText('Estorno concluído')).toBeInTheDocument();
});

it('modo direto: quanto volta, da conta de quem, e a etapa', () => {
  render(<CancellationStatus cancellation={{ ...base, cancelledBy: 'customer', reasonCode: 'customer_request' }} storeName="Eletro Center"
    direct={{ stage: 'devolvendo', amount: 189.9, requestedAt: '2026-10-08T10:02:00', acceptedAt: null, doneAt: null }} />);
  expect(screen.getByText('Devolvendo')).toBeInTheDocument();
  expect(screen.getByText('R$ 189,90 voltam para você')).toBeInTheDocument();
  expect(screen.getByText('Pelo mesmo Pix, direto da conta da Eletro Center. Costuma cair em minutos.')).toBeInTheDocument();
  expect(screen.getByText('Devolução pedida à conta da loja')).toBeInTheDocument();
  expect(screen.getByText('Se demorar mais de 1 dia')).toBeInTheDocument();
});

it('modo direto devolvido: diz quando', () => {
  render(<CancellationStatus cancellation={base} storeName="Eletro Center"
    direct={{ stage: 'devolvido', amount: 189.9, requestedAt: '2026-10-08T10:02:00', acceptedAt: '2026-10-08T10:03:00', doneAt: '2026-10-08T10:05:00' }} />);
  expect(screen.getByText(/^R\$ 189,90 devolvidos em \d{2}\/\d{2} às \d{2}:\d{2}$/)).toBeInTheDocument();
  expect(screen.queryByText('Se demorar mais de 1 dia')).toBeNull();
});

it('reembolso que falhou: aviso com o suporte já avisado', () => {
  render(<CancellationStatus cancellation={{ ...base, refundStatus: 'failed' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('O suporte já foi avisado e resolve com prioridade.');
});

it.each(['conferindo', 'resolvendo'] as const)('modo direto "%s": não promete prazo', (stage) => {
  render(<CancellationStatus cancellation={base} storeName="Eletro Center"
    direct={{ stage, amount: 189.9, requestedAt: '2026-10-08T10:02:00', acceptedAt: null, doneAt: null }} />);
  expect(screen.getByText('Pelo mesmo Pix, direto da conta da Eletro Center.')).toBeInTheDocument();
  expect(screen.queryByText(/Costuma cair em minutos/)).toBeNull();
});
