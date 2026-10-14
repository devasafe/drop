import { getNavItems } from '../lib/navConfig';

const allow = () => true;
const labels = (role: any, mode: string, isCeo = false) =>
  getNavItems(role, allow, isCeo, { settlementMode: mode }).map((i) => i.label);

describe('navConfig — modo de liquidação', () => {
  it('direto: some Carteira / Financeiro da loja / Plano e comissão; o motoboy mantém as 4 abas', () => {
    expect(labels('cliente', 'direto')).not.toContain('Carteira');
    expect(labels('lojista', 'direto')).not.toContain('Financeiro da loja');
    expect(labels('lojista', 'direto')).not.toContain('Plano e comissão');
    expect(labels('motoboy', 'direto')).toEqual(['Corridas', 'Ganhos', 'Nível', 'Perfil']);
  });

  it('direto: admin esconde carteiras, saques, payouts, caixa e planos', () => {
    const l = labels('ceo', 'direto', true);
    for (const x of ['Carteiras', 'Saques', 'Payouts', 'Caixa', 'Planos']) expect(l).not.toContain(x);
    expect(l).toContain('Usuários');
  });

  it('custódia: os itens aparecem', () => {
    expect(labels('cliente', 'custodia')).toContain('Carteira');
    expect(labels('lojista', 'custodia')).toEqual(expect.arrayContaining(['Dinheiro', 'Plano e comissão']));
    expect(labels('motoboy', 'custodia')).toEqual(['Corridas', 'Ganhos', 'Nível', 'Perfil']);
    expect(labels('ceo', 'custodia', true)).toEqual(expect.arrayContaining(['Carteiras', 'Saques', 'Payouts', 'Caixa', 'Planos']));
  });

  it('sem opções: comportamento atual (custódia)', () => {
    expect(getNavItems('cliente', allow, false).map((i) => i.label)).toContain('Carteira');
  });

  it('Conta Asaas (lojista) aparece só no modo direto', () => {
    expect(labels('lojista', 'direto')).toContain('Conta Asaas');
    expect(labels('lojista', 'custodia')).not.toContain('Conta Asaas');
    expect(getNavItems('lojista', allow, false).map((i) => i.label)).not.toContain('Conta Asaas');
  });
});
