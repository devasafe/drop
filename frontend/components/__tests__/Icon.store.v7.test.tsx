/** V7 (auditoria visual D1, M8): na barra da loja, "Loja" (vitrine) não pode ser a mesma casinha de "Agora". */
import { render } from '@testing-library/react';
import Icon from '../Icon';
import { getNavItems } from '../../lib/navConfig';

const d = (name: 'store' | 'home') => render(<Icon name={name} />).container.querySelector('path')!.getAttribute('d');

it('o ícone da loja é uma vitrine, diferente da casa', () => {
  expect(d('store')).not.toBe(d('home'));
});

it('as abas Agora e Loja usam ícones diferentes', () => {
  const tabs = getNavItems('lojista', () => true, false, { settlementMode: 'custodia' }).filter((i) => i.placement.includes('bottomNav'));
  const icon = (label: string) => tabs.find((t) => t.label === label)!.icon;
  expect(icon('Loja')).toBe('store');
  expect(d(icon('Loja') as 'store')).not.toBe(d(icon('Agora') as 'home'));
});
