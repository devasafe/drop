import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Sheet } from '../Sheet';

function Harness({ autoFocusChild = false }: { autoFocusChild?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Endereço" presentation="bottom">
        {autoFocusChild && <input aria-label="CEP" autoFocus />}
        <button>Primeiro</button>
        <button>Último</button>
      </Sheet>
    </>
  );
}

function Nested() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  return (
    <>
      <Sheet open={outer} onClose={() => setOuter(false)} title="Fora">
        <button onClick={() => setInner(true)}>Abrir dentro</button>
      </Sheet>
      <Sheet open={inner} onClose={() => setInner(false)} title="Dentro">
        <button>Ok</button>
      </Sheet>
    </>
  );
}

// onClose inline muda de identidade a cada render do pai (o contador força o re-render).
function NestedRerender() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  const [, setTick] = useState(0);
  return (
    <>
      <button onClick={() => setTick((t) => t + 1)}>Re-render</button>
      <Sheet open={outer} onClose={() => setOuter(false)} title="Fora">
        <button onClick={() => setInner(true)}>Abrir dentro</button>
      </Sheet>
      <Sheet open={inner} onClose={() => setInner(false)} title="Dentro">
        <button>Ok</button>
      </Sheet>
    </>
  );
}

describe('Sheet — acessibilidade (fase C)', () => {
  it('Tab no último volta ao primeiro foco do dialog; Shift+Tab no primeiro vai ao último', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');
    const fechar = screen.getByRole('button', { name: 'Fechar' });
    const ultimo = screen.getByRole('button', { name: 'Último' });
    ultimo.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(fechar);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it('filho com autoFocus: ao fechar, o foco volta para quem abriu (não para o campo)', () => {
    render(<Harness autoFocusChild />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText('CEP'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('dois sheets abertos: Esc fecha só o de cima', () => {
    render(<Nested />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir dentro' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Fora' })).toBeInTheDocument();
  });

  it('re-render com onClose novo não re-empilha: Esc ainda fecha só o de cima, depois o de baixo', () => {
    render(<NestedRerender />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir dentro' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    // Re-renders trocam a identidade dos dois onClose; o de baixo não pode passar à frente.
    fireEvent.click(screen.getByRole('button', { name: 'Re-render' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-render' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Fora' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
