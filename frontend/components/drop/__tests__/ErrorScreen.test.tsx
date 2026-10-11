import { render, screen, fireEvent } from '@testing-library/react';
import { Lock } from 'lucide-react';
import { ErrorScreen } from '../ErrorScreen';

it('título, o que fazer e sempre um primário', () => {
  const go = jest.fn();
  render(<ErrorScreen icon={<Lock />} title="Esta área não é do seu perfil" description="Você entrou como cliente." primary={{ label: 'Ir para o Início', onClick: go }} />);
  expect(screen.getByRole('heading', { name: 'Esta área não é do seu perfil' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ir para o Início' }));
  expect(go).toHaveBeenCalled();
});

it('ação secundária opcional', () => {
  const second = jest.fn();
  render(<ErrorScreen icon={<Lock />} title="T" description="D" primary={{ label: 'Um', onClick: jest.fn() }} secondary={{ label: 'Dois', onClick: second }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Dois' }));
  expect(second).toHaveBeenCalled();
});
