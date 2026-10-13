// frontend/components/seller/ui/__tests__/NavRow.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { NavRow } from '../NavRow';

test('linha com rótulo, apoio e toque', () => {
  const onClick = jest.fn();
  render(<ul><NavRow icon={<span />} label="Horários" sub="Seg–Sex 9h–22h" onClick={onClick} /></ul>);
  const btn = screen.getByRole('button', { name: /Horários/ });
  expect(screen.getByText('Seg–Sex 9h–22h')).toBeInTheDocument();
  fireEvent.click(btn);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('end troca a seta', () => {
  render(<ul><NavRow icon={<span />} label="Plano" end={<span>atual</span>} onClick={() => {}} /></ul>);
  expect(screen.getByText('atual')).toBeInTheDocument();
});
