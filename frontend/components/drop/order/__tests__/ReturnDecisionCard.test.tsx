import { render, screen, fireEvent } from '@testing-library/react';
import { ReturnDecisionCard } from '../ReturnDecisionCard';

const props = { courierName: 'Carlos Silva', storeName: 'Eletro Center', refundAmount: 244, paymentMethod: 'pix', chosen: null, onConfirm: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('conta a verdade e já vem com "Nova entrega" marcada', () => {
  render(<ReturnDecisionCard {...props} />);
  expect(screen.getByRole('heading', { name: 'O motoboy não conseguiu concluir' })).toBeInTheDocument();
  expect(screen.getByText(/Carlos teve um problema depois de retirar\. O pacote está voltando para a Eletro Center\./)).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Nova entrega/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /Reembolso de R\$\s?244,00/ })).not.toBeChecked();
  expect(screen.getByText(/Se não escolher, o pedido é cancelado e o valor volta quando a loja receber o pacote\./)).toBeInTheDocument();
});

test('confirmar nova entrega', () => {
  render(<ReturnDecisionCard {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar nova entrega' }));
  expect(props.onConfirm).toHaveBeenCalledWith('reentrega');
});

test('trocar para reembolso muda o botão e a escolha enviada', () => {
  render(<ReturnDecisionCard {...props} />);
  fireEvent.click(screen.getByRole('radio', { name: /Reembolso/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar reembolso' }));
  expect(props.onConfirm).toHaveBeenCalledWith('reembolso');
});

test('nova entrega já escolhida: some a pergunta, fica a confirmação', () => {
  render(<ReturnDecisionCard {...props} chosen="reassign" />);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.getByText('Nova entrega confirmada')).toBeInTheDocument();
  expect(screen.getByText(/Assim que a loja receber o pacote, procuramos outro motoboy\./)).toBeInTheDocument();
});

test('sem nome do motoboy, fala do entregador', () => {
  render(<ReturnDecisionCard {...props} courierName={undefined} />);
  expect(screen.getByText(/O entregador teve um problema depois de retirar/)).toBeInTheDocument();
});

test('enviando: o botão trava', () => {
  render(<ReturnDecisionCard {...props} busy />);
  expect(screen.getByRole('button', { name: /Confirmar nova entrega/ })).toBeDisabled();
});

test('reembolso já escolhido: confirma e diz que o valor volta quando a loja receber o pacote', () => {
  render(<ReturnDecisionCard {...props} chosen="cancel" />);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.getByText('Reembolso confirmado')).toBeInTheDocument();
  expect(screen.getByText(/Os R\$\s?244,00 voltam quando a loja receber o pacote\./)).toBeInTheDocument();
});
