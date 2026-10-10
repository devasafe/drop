import { render, screen, fireEvent } from '@testing-library/react';
import { SearchField } from '../SearchField';

it('Enter confirma, mas não durante composição de IME', () => {
  const onSubmit = jest.fn();
  render(<SearchField value="fone" onChange={() => {}} onSubmit={onSubmit} inputProps={{ 'aria-label': 'Buscar' }} />);
  const box = screen.getByRole('searchbox', { name: 'Buscar' });
  fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(onSubmit).toHaveBeenCalledWith('fone');
});
