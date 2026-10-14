import { render, screen } from '@testing-library/react';

let mockPath = '/motoboy/ganhos';
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), pathname: mockPath, asPath: mockPath }) }));
import MotoboyShell from '../MotoboyShell';

test('aba do motoboy guarda o espaço da barra; tela de fluxo não', () => {
  mockPath = '/motoboy/ganhos';
  const a = render(<MotoboyShell title="Ganhos">x</MotoboyShell>);
  expect(screen.getByRole('heading', { level: 1, name: 'Ganhos' })).toBeInTheDocument();
  expect((a.container.firstElementChild as HTMLElement).className).not.toContain('noBar');
  a.unmount();
  mockPath = '/motoboy/corrida/[id]';
  const b = render(<MotoboyShell title="Retirar na loja" back="/motoboy">x</MotoboyShell>);
  expect((b.container.firstElementChild as HTMLElement).className).toContain('noBar');
});

test('Entregas fica sob a aba Corridas: com a barra', () => {
  mockPath = '/motoboy/entregas';
  const { container } = render(<MotoboyShell title="Suas entregas" back="/motoboy">x</MotoboyShell>);
  expect((container.firstElementChild as HTMLElement).className).not.toContain('noBar');
});
