import { render, screen } from '@testing-library/react';
import { AppHeader } from '../AppHeader';

describe('AppHeader', () => {
  it('a logo é uma imagem (logog_png)', () => {
    render(<AppHeader />);
    const logo = screen.getByAltText('DROP');
    expect(logo.tagName).toBe('IMG');
    expect(logo.getAttribute('src')).toMatch(/logog_png/);
  });
  it('renderiza accountSlot no lugar do avatar padrão', () => {
    render(<AppHeader accountSlot={<button aria-label="slot-conta" />} />);
    expect(screen.getByLabelText('slot-conta')).toBeInTheDocument();
    expect(screen.queryByLabelText('Perfil')).toBeNull();
  });
  it('sem accountSlot mantém o avatar padrão', () => {
    render(<AppHeader />);
    expect(screen.getByLabelText('Perfil')).toBeInTheDocument();
  });
});
