import { render, screen, fireEvent } from '@testing-library/react';
import { SearchField } from '../SearchField';

test('digita e chama onChange; botão de filtro dispara onFilter', () => {
  const onChange = jest.fn();
  const onFilter = jest.fn();
  render(<SearchField value="" onChange={onChange} placeholder="Buscar" onFilter={onFilter} />);
  fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'fone' } });
  expect(onChange).toHaveBeenCalledWith('fone');
  fireEvent.click(screen.getByLabelText('Filtrar'));
  expect(onFilter).toHaveBeenCalled();
});
