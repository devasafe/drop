import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { DeliveredReview } from '../DeliveredReview';

const base = { storeName: 'Eletro Center', courier: { name: 'Carlos Silva', plate: 'ABC1D23' }, createdAt: '2026-10-10T14:02:00', deliveredAt: '2026-10-10T14:29:00', storeDone: false, courierDone: false, onHelp: jest.fn() };

it('entregue com a hora e o tempo; avalia os dois num envio', async () => {
  const onSubmit = jest.fn(async () => {});
  render(<DeliveredReview {...base} onSubmit={onSubmit} />);
  expect(screen.getByText(/^Entregue às \d{2}:\d{2}$/)).toBeInTheDocument();
  expect(screen.getByText('27 min do pagamento até a sua porta.')).toBeInTheDocument();
  expect(screen.getByText('E o Carlos, na entrega?')).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Nota da loja' })).getByRole('radio', { name: '5 estrelas' }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Nota do entregador' })).getByRole('radio', { name: '4 estrelas' }));
  fireEvent.change(screen.getByLabelText('Comentário sobre a entrega (opcional)'), { target: { value: 'Rápido' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliações' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ store: 5, courier: 4, storeComment: '', courierComment: 'Rápido' }));
});

it('Plano 1: sem entregador; nota baixa oferece o suporte', async () => {
  const onHelp = jest.fn();
  render(<DeliveredReview {...base} courier={null} onHelp={onHelp} onSubmit={async () => {}} />);
  expect(screen.queryByRole('radiogroup', { name: 'Nota do entregador' })).toBeNull();
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Nota da loja' })).getByRole('radio', { name: '2 estrelas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliações' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Falar com o suporte' }));
  expect(onHelp).toHaveBeenCalled();
});

it('já avaliado: obrigado, sem botão de enviar', () => {
  render(<DeliveredReview {...base} storeDone courierDone onSubmit={async () => {}} />);
  expect(screen.getByText('Obrigado pela avaliação')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Enviar avaliações' })).toBeNull();
});

it('envio que falha mantém o formulário', async () => {
  const onSubmit = jest.fn(async () => { throw new Error('x'); });
  render(<DeliveredReview {...base} onSubmit={onSubmit} />);
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Nota da loja' })).getByRole('radio', { name: '5 estrelas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliações' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(await screen.findByRole('button', { name: 'Enviar avaliações' })).toBeEnabled();
  expect(screen.queryByText('Obrigado pela avaliação')).toBeNull();
});
