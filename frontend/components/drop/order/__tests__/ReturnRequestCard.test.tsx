import { render, screen, fireEvent } from '@testing-library/react';
import { ReturnRequestCard } from '../ReturnRequestCard';

const base = { _id: 'rr1', orderId: 'o1', reason: 'defeito', amount: 244, includesDeliveryFee: true, mode: null, rejectReasonText: null };
const props = { storeName: 'Eletro Center', storeAddress: 'R. dos Pinheiros, 870 · loja 3', onChooseStore: jest.fn(), onSupport: jest.fn() };

beforeEach(() => jest.clearAllMocks());

/** Acompanhamento do reembolso no pedido entregue (caso B). */
test('aguardando a loja', () => {
  render(<ReturnRequestCard {...props} request={{ ...base, status: 'aguardando_loja' }} />);
  expect(screen.getByText('Reembolso pedido')).toBeInTheDocument();
  expect(screen.getByText(/A Eletro Center está analisando\. Avisamos aqui e no push\./)).toBeInTheDocument();
});

test('recusado: mostra o motivo da lista e o caminho do suporte', () => {
  render(<ReturnRequestCard {...props} request={{ ...base, status: 'recusado', rejectReasonText: 'Produto com marca de uso' }} />);
  expect(screen.getByText('Reembolso recusado')).toBeInTheDocument();
  expect(screen.getByText(/Produto com marca de uso/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Falar com o suporte' }));
  expect(props.onSupport).toHaveBeenCalled();
});

test('aprovado: "Levo na loja" grátis já marcado e continuar', () => {
  render(<ReturnRequestCard {...props} request={{ ...base, status: 'aprovado' }} />);
  expect(screen.getByText('Aprovado pela Eletro Center')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Como você vai devolver?' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Levo na loja/ })).toBeChecked();
  expect(screen.getByText(/Grátis · R\. dos Pinheiros, 870 · loja 3/)).toBeInTheDocument();
  expect(screen.getByText(/O reembolso de R\$ 244,00 sai quando a loja receber o produto\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(props.onChooseStore).toHaveBeenCalled();
});

test('devolvendo: o código grande, a loja e quando o dinheiro sai', () => {
  render(<ReturnRequestCard {...props} request={{ ...base, status: 'devolvendo', mode: 'loja', pin: '48213' }} />);
  expect(screen.getByText('Código de devolução')).toBeInTheDocument();
  expect(screen.getByText('48213')).toBeInTheDocument();
  expect(screen.getByText(/Mostre este código na loja ao entregar o produto\./)).toBeInTheDocument();
  expect(screen.getByText(/Sai quando a loja digitar o código\./)).toBeInTheDocument();
});

test('concluído: produto devolvido e estorno pedido', () => {
  render(<ReturnRequestCard {...props} request={{ ...base, status: 'concluido' }} />);
  expect(screen.getByText('Produto devolvido')).toBeInTheDocument();
  expect(screen.getByText(/O estorno de R\$ 244,00 foi pedido/)).toBeInTheDocument();
});
