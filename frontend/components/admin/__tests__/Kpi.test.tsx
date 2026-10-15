import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { Kpi } from '../Kpi';

describe('Kpi', () => {
  it('rótulo, número e dica', () => {
    render(<Kpi label="Pedidos hoje" value="214" hint="9 em andamento agora" />);
    expect(screen.getByText('Pedidos hoje')).toBeInTheDocument();
    expect(screen.getByText('214').tagName).toBe('STRONG');
    expect(screen.getByText('9 em andamento agora')).toBeInTheDocument();
  });

  it('sem dica, só rótulo e número', () => {
    const { container } = render(<Kpi label="Cancelamentos" value="6" />);
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });
});

describe('AdminBlocks.module.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'AdminBlocks.module.css'), 'utf8');
  it.each(['block', 'blockHead', 'grid2', 'grid3', 'muted', 'money', 'kpis', 'kpi'])('tem .%s', (cls) => {
    expect(css).toMatch(new RegExp(`\\.${cls}\\b`));
  });
  it('.money: à direita e com números de largura fixa', () => {
    const money = /\.money\s*\{([^}]*)\}/.exec(css)![1];
    expect(money).toMatch(/text-align:\s*right/);
    expect(money).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});
