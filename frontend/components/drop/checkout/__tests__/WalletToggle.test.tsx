import { render, screen, fireEvent } from '@testing-library/react';
import { WalletToggle } from '../WalletToggle';

test('desabilitado não chama onChange', () => {
  const onChange = jest.fn();
  render(<WalletToggle balance={50} enabled={false} checked={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('switch'));
  expect(onChange).not.toHaveBeenCalled();
});

test('habilitado alterna', () => {
  const onChange = jest.fn();
  render(<WalletToggle balance={50} enabled checked={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('switch'));
  expect(onChange).toHaveBeenCalledWith(true);
});

test('mostra saldo formatado', () => {
  render(<WalletToggle balance={123.4} enabled checked={false} onChange={jest.fn()} />);
  expect(screen.getByText(/123,40/)).toBeInTheDocument();
});

test('switch reflete estado marcado via aria-checked', () => {
  render(<WalletToggle balance={50} enabled checked={true} onChange={jest.fn()} />);
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});

test('desabilitado marca aria-disabled/disabled no switch', () => {
  render(<WalletToggle balance={50} enabled={false} checked={false} onChange={jest.fn()} />);
  expect(screen.getByRole('switch')).toBeDisabled();
});

test('sem dívida pendente não mostra aviso', () => {
  render(<WalletToggle balance={50} enabled checked={false} onChange={jest.fn()} />);
  expect(screen.queryByText(/pendente/i)).not.toBeInTheDocument();
});

test('com dívida pendente mostra aviso destacado', () => {
  render(<WalletToggle balance={50} enabled checked={false} onChange={jest.fn()} pendingDebt={30} />);
  expect(screen.getByText(/pendente/i)).toBeInTheDocument();
  expect(screen.getByText(/30,00/)).toBeInTheDocument();
});
