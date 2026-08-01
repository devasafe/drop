import { render, screen, act } from '@testing-library/react';
import { OverlayProvider, useOverlay } from '../OverlayContext';

function Probe() {
  const { active, open, close, toggle, isOpen } = useOverlay();
  return (
    <div>
      <span data-testid="active">{active ?? 'none'}</span>
      <span data-testid="chat-open">{String(isOpen('chat'))}</span>
      <button onClick={() => open('account')}>open-account</button>
      <button onClick={() => open('panelSidebar')}>open-sidebar</button>
      <button onClick={() => toggle('chat')}>toggle-chat</button>
      <button onClick={() => close()}>close</button>
      <button onClick={() => close('chat')}>close-chat</button>
    </div>
  );
}

const setup = () =>
  render(<OverlayProvider><Probe /></OverlayProvider>);

describe('OverlayContext', () => {
  it('começa sem overlay', () => {
    setup();
    expect(screen.getByTestId('active').textContent).toBe('none');
  });

  it('abrir um fecha o outro (um por vez)', () => {
    setup();
    act(() => screen.getByText('open-account').click());
    expect(screen.getByTestId('active').textContent).toBe('account');
    act(() => screen.getByText('open-sidebar').click());
    expect(screen.getByTestId('active').textContent).toBe('panelSidebar');
  });

  it('toggle abre e fecha o mesmo id', () => {
    setup();
    act(() => screen.getByText('toggle-chat').click());
    expect(screen.getByTestId('chat-open').textContent).toBe('true');
    act(() => screen.getByText('toggle-chat').click());
    expect(screen.getByTestId('chat-open').textContent).toBe('false');
  });

  it('close() zera o overlay ativo', () => {
    setup();
    act(() => screen.getByText('open-account').click());
    act(() => screen.getByText('close').click());
    expect(screen.getByTestId('active').textContent).toBe('none');
  });

  it('close(id) só fecha se id for o overlay ativo', () => {
    setup();
    act(() => screen.getByText('open-account').click());   // active = account
    act(() => screen.getByText('close-chat').click());      // close('chat') não é o ativo → no-op
    expect(screen.getByTestId('active').textContent).toBe('account');
  });
});
