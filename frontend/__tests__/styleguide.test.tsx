import { render, screen } from '@testing-library/react';
import Styleguide from '../pages/_styleguide';

test('styleguide renderiza seções de tokens e componentes', () => {
  render(<Styleguide />);
  expect(screen.getByText('Cores')).toBeInTheDocument();
  expect(screen.getByText('Componentes de delivery')).toBeInTheDocument();
  // estados representados
  expect(screen.getByText('Loading')).toBeInTheDocument();
  expect(screen.getByText('Vazio')).toBeInTheDocument();
});
