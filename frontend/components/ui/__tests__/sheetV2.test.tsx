import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import fs from 'fs';
import path from 'path';
import { Sheet } from '../Sheet';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

function Harness({ presentation }: { presentation?: 'bottom' | 'center' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Trocar endereço" presentation={presentation}>
        <button>Dentro</button>
      </Sheet>
    </>
  );
}

it('abre em portal como dialog modal, Esc fecha e o foco volta', () => {
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Abrir' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Trocar endereço' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog.closest('body')).toBe(document.body);
  expect(dialog.parentElement?.parentElement).toBe(document.body);
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
});
it('center usa a classe center; padrão usa bottom', () => {
  const { unmount } = render(<Harness presentation="center" />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(screen.getByRole('dialog').className).toMatch(/center/);
  unmount();
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(screen.getByRole('dialog').className).toMatch(/bottom/);
});
it('CSS do Sheet só usa tokens semânticos', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'Sheet.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
