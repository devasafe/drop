import { render, screen, fireEvent } from '@testing-library/react';
import { Sheet } from '../Sheet';
test('Sheet fecha ao clicar no backdrop', () => {
  const onClose = jest.fn();
  render(<Sheet open onClose={onClose} title="Endereços"><p>conteúdo</p></Sheet>);
  expect(screen.getByText('Endereços')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('sheet-backdrop'));
  expect(onClose).toHaveBeenCalled();
});
test('Sheet fechado não renderiza conteúdo', () => {
  render(<Sheet open={false} onClose={()=>{}}><p>x</p></Sheet>);
  expect(screen.queryByText('x')).toBeNull();
});
