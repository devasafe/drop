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

describe('chamar um motoboy (fase 2b)', () => {
  test('defeito: a opção de motoboy aparece grátis, paga pela loja, e continuar escolhe o motoboy', () => {
    const onChooseMotoboy = jest.fn();
    render(<ReturnRequestCard {...props} onChooseMotoboy={onChooseMotoboy} request={{ ...base, status: 'aprovado' }} />);
    const motoboy = screen.getByRole('radio', { name: /Chamar um motoboy/ });
    expect(screen.getByText('Grátis: a loja paga, porque veio com defeito')).toBeInTheDocument();
    fireEvent.click(motoboy);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onChooseMotoboy).toHaveBeenCalled();
    expect(props.onChooseStore).not.toHaveBeenCalled();
  });

  test('arrependimento: sem a opção de motoboy por enquanto', () => {
    render(<ReturnRequestCard {...props} onChooseMotoboy={jest.fn()} request={{ ...base, reason: 'arrependimento', status: 'aprovado' }} />);
    expect(screen.queryByRole('radio', { name: /Chamar um motoboy/ })).not.toBeInTheDocument();
  });

  test('procurando motoboy', () => {
    render(<ReturnRequestCard {...props} request={{ ...base, status: 'devolvendo', mode: 'motoboy', ride: { status: 'pending' } }} />);
    expect(screen.getByText('Procurando um motoboy')).toBeInTheDocument();
  });

  test('motoboy a caminho: o código de retirada para mostrar a ele', () => {
    render(<ReturnRequestCard {...props} request={{ ...base, status: 'devolvendo', mode: 'motoboy', ride: { status: 'assigned', motoboyName: 'Carlos Lima', pickupPin: '52817' } }} />);
    expect(screen.getByText('Código de retirada')).toBeInTheDocument();
    expect(screen.getByText('52817')).toBeInTheDocument();
    expect(screen.getByText(/Carlos está a caminho para buscar o produto. Mostre este código na retirada./)).toBeInTheDocument();
  });

  test('produto com o motoboy: está levando à loja e o reembolso sai quando ela receber', () => {
    render(<ReturnRequestCard {...props} request={{ ...base, status: 'devolvendo', mode: 'motoboy', ride: { status: 'picked', motoboyName: 'Carlos Lima' } }} />);
    expect(screen.getByText('Carlos está levando à loja')).toBeInTheDocument();
    expect(screen.getByText(/O reembolso de R\$ 244,00 sai quando a loja receber o produto\./)).toBeInTheDocument();
    expect(screen.queryByText('Código de retirada')).not.toBeInTheDocument();
  });
});
