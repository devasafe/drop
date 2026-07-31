import { render, screen, fireEvent } from '@testing-library/react';
import { CancelOrderSheet } from '../CancelOrderSheet';

test('lista motivos e dispara onConfirm com o motivo', () => {
  const onConfirm = jest.fn();
  render(<CancelOrderSheet open onClose={() => {}} onConfirm={onConfirm} fee={5} />);
  fireEvent.click(screen.getByText(/endereço errado/i));
  fireEvent.click(screen.getByRole('button', { name: /confirmar cancelamento/i }));
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ reasonCode: 'address_invalid' }));
});

test('mostra o valor da taxa quando fee > 0', () => {
  render(<CancelOrderSheet open onClose={() => {}} onConfirm={() => {}} fee={12.5} />);
  expect(screen.getByText(/R\$ 12,50/)).toBeInTheDocument();
});

test('sem fee não inventa valor nem mostra aviso de taxa', () => {
  render(<CancelOrderSheet open onClose={() => {}} onConfirm={() => {}} />);
  expect(screen.queryByText(/taxa de cancelamento/i)).not.toBeInTheDocument();
});

test('fee=0 também não mostra aviso de taxa', () => {
  render(<CancelOrderSheet open onClose={() => {}} onConfirm={() => {}} fee={0} />);
  expect(screen.queryByText(/taxa de cancelamento/i)).not.toBeInTheDocument();
});

test('motivo em branco desabilita a confirmação', () => {
  render(<CancelOrderSheet open onClose={() => {}} onConfirm={() => {}} />);
  fireEvent.click(screen.getByText(/outro motivo/i));
  fireEvent.change(screen.getByLabelText(/motivo do cancelamento/i), { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: /confirmar cancelamento/i })).toBeDisabled();
});

test('fechado não renderiza conteúdo', () => {
  render(<CancelOrderSheet open={false} onClose={() => {}} onConfirm={() => {}} />);
  expect(screen.queryByText(/endereço errado/i)).not.toBeInTheDocument();
});
