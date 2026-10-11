import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

const css = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('Button v2', () => {
  it('aceita secondary e tertiary', () => {
    render(<><Button variant="secondary">A</Button><Button variant="tertiary">B</Button></>);
    expect(screen.getByRole('button', { name: 'A' }).className).toMatch(/secondary/);
    expect(screen.getByRole('button', { name: 'B' }).className).toMatch(/tertiary/);
  });
  it('ghost e accent continuam funcionando (mapeados)', () => {
    render(<><Button variant={'ghost' as any}>G</Button><Button variant={'accent' as any}>X</Button></>);
    expect(screen.getByRole('button', { name: 'G' }).className).toMatch(/tertiary/);
    expect(screen.getByRole('button', { name: 'X' }).className).toMatch(/primary/);
  });
  it('loading mantém o rótulo e marca aria-busy', () => {
    render(<Button loading>Pagar</Button>);
    const b = screen.getByRole('button', { name: /Pagar/ });
    expect(b).toHaveAttribute('aria-busy', 'true');
  });
  it('CSS só usa tokens semânticos (sem hex, sem token antigo, sem glow)', () => {
    expect(cssViolations(css('Button.module.css'))).toEqual([]);
    expect(cssViolations(css('IconButton.module.css'))).toEqual([]);
  });
  it('IconButton garante área de toque mínima', () => {
    expect(css('IconButton.module.css')).toMatch(/--touch-min/);
    render(<IconButton aria-label="Fechar" icon={<span>x</span>} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });
});
