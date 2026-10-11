import { render, screen, fireEvent } from '@testing-library/react';
import { InstallmentList } from '../InstallmentList';

const options = [
  { count: 1, installmentValue: 251.07, total: 251.07 },
  { count: 3, installmentValue: 85.9, total: 257.7 },
];
it('cada opção mostra parcela, total e acréscimo; escolher chama onChange', () => {
  const onChange = jest.fn();
  render(<InstallmentList options={options} base={244} value={1} onChange={onChange} />);
  expect(screen.getByText('À vista · R$ 251,07')).toBeInTheDocument();
  expect(screen.getByText('+ R$ 7,07 da operadora')).toBeInTheDocument();
  expect(screen.getByText('3x de R$ 85,90')).toBeInTheDocument();
  expect(screen.getByText('total R$ 257,70 · + R$ 13,70')).toBeInTheDocument();
  expect(screen.getByText('O acréscimo é a taxa da operadora do cartão. No Pix você paga R$ 244,00.')).toBeInTheDocument();
  fireEvent.click(screen.getByText('3x de R$ 85,90'));
  expect(onChange).toHaveBeenCalledWith(3);
});
