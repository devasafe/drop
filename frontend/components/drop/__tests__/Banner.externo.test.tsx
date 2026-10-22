/** Rodada final (M5): link externo do banner reconhecido sem diferenciar maiúsculas (HTTPS:// abre em nova aba). */
import { render, screen } from '@testing-library/react';
import { Banner } from '../Banner';

describe('Banner: link externo', () => {
  it.each(['https://drop.app/x', 'HTTPS://drop.app/x', 'Http://drop.app/x'])('%s abre em nova aba', (href) => {
    render(<Banner items={[{ id: 'b1', title: 'Aviso', href }]} />);
    const a = screen.getByRole('link', { name: 'Aviso' });
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('caminho interno não abre em nova aba', () => {
    render(<Banner items={[{ id: 'b1', title: 'Aviso', href: '/loja/abc' }]} />);
    expect(screen.getByRole('link', { name: 'Aviso' })).not.toHaveAttribute('target');
  });
});
