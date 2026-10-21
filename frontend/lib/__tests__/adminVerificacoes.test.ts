import {
  buildVerificationPeople, formatStoreAddress, isVerificationAlreadyDecided,
} from '../adminVerificacoes';
import { CLIENTE, FULL, LOJA, MOTOBOY, PAULO_DOC, PAULO_FACIAL } from '../../__tests__/helpers/verificacoesFixtures';

const lists = (q: typeof FULL) => ({
  docs: (q.pending ?? []) as Record<string, unknown>[],
  stores: (q.stores ?? []) as Record<string, unknown>[],
  facialOwners: (q.facial ?? []) as Record<string, unknown>[],
  motoboys: (q.motoboys ?? []) as Record<string, unknown>[],
});

describe('buildVerificationPeople (mesma junção da página antiga)', () => {
  it('uma pessoa por usuário, na ordem lojistas → motoboys → clientes', () => {
    const people = buildVerificationPeople(lists(FULL));
    expect(people.map((p) => [p.name, p.kind])).toEqual([
      ['Paulo Henrique', 'lojista'], ['Carlos Lima', 'motoboy'], ['Ana Souza', 'cliente'],
    ]);
    expect(people[0].storeNames).toEqual(['Eletro Center']);
    expect(people[0].email).toBe('paulo@eletro.com');
  });

  it('itens do lojista: documento, selfie, CNPJ e endereço, com URL e permissão da rota', () => {
    const [paulo] = buildVerificationPeople(lists(FULL));
    expect(paulo.items.map((i) => [i.label, i.approveUrl, i.rejectUrl, i.permission])).toEqual([
      ['Documento', '/verification/admin/l2/approve', '/verification/admin/l2/reject', 'verification:review_clients'],
      ['Selfie (comparar com o documento)', '/verification/admin/facial/l2/approve', '/verification/admin/facial/l2/reject', 'verification:review_stores'],
      ['CNPJ · Eletro Center', '/verification/admin/store/s1/cnpj/approve', '/verification/admin/store/s1/cnpj/reject', 'verification:review_stores'],
      ['Endereço · Eletro Center', '/verification/admin/store/s1/address/approve', '/verification/admin/store/s1/address/reject', 'verification:review_stores'],
    ]);
    expect(paulo.items[0].detail).toBe('Tipo: CNH · Nº 998877');
    expect(paulo.items[0].images).toEqual([
      { url: 'https://cdn.x/frente.jpg', label: 'Frente' },
      { url: 'https://cdn.x/verso.jpg', label: 'Verso' },
    ]);
    expect(paulo.items[2].detail).toBe('12.345.678/0001-90 · Eletro Center LTDA · ATIVA');
    expect(paulo.items[3].detail).toBe('Rua Augusta, 100 — Consolação · São Paulo · SP — CEP 01305-000');
  });

  it('motoboy: a selfie vem da fila de motoboys quando pendente; CNH e placa com as duas fotos', () => {
    const people = buildVerificationPeople(lists({ motoboys: [MOTOBOY] }));
    expect(people).toHaveLength(1);
    expect(people[0].items.map((i) => [i.kind, i.permission])).toEqual([
      ['facial', 'verification:review_stores'],
      ['courier', 'verification:review_motoboys'],
    ]);
    expect(people[0].items[1].detail).toBe('CNH: 0099 · Placa: ABC1D23');
    expect(people[0].items[1].images.map((i) => i.label)).toEqual(['Foto da CNH', 'Foto da placa']);
  });

  it('cliente: só o documento; pessoa sem item pendente não aparece', () => {
    const soSelfie = { ...CLIENTE, _id: 'c2', name: 'Bruno Alves', verification: { facial: { status: 'pending', selfieUrl: 'https://cdn.x/s.jpg' } } };
    const people = buildVerificationPeople(lists({ pending: [CLIENTE], facial: [soSelfie] }));
    expect(people.map((p) => p.name)).toEqual(['Ana Souza']);
    expect(people[0].items.map((i) => i.kind)).toEqual(['document']);
  });

  it('documento já decidido não vira item', () => {
    const decidido = { ...PAULO_DOC, verification: { document: { ...PAULO_DOC.verification.document, status: 'approved' } } };
    const people = buildVerificationPeople(lists({ pending: [decidido], facial: [PAULO_FACIAL] }));
    expect(people[0].items.map((i) => i.kind)).toEqual(['facial']);
  });

  it('chaves únicas por item', () => {
    const keys = buildVerificationPeople(lists(FULL)).flatMap((p) => p.items.map((i) => i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('formatStoreAddress', () => {
  it('rua, bairro, cidade e CEP; cai no endereço solto quando não há partes', () => {
    expect(formatStoreAddress(LOJA)).toBe('Rua Augusta, 100 — Consolação · São Paulo · SP — CEP 01305-000');
    expect(formatStoreAddress({ address: 'Av. Paulista, 1000' })).toBe('Av. Paulista, 1000');
    expect(formatStoreAddress({})).toBe('');
  });
});

describe('isVerificationAlreadyDecided (o "já feito" destas rotas é 400 "não está pendente")', () => {
  const http = (status: number, error: string) => ({ response: { status, data: { error } } });
  it.each([
    'Documento não está pendente', 'Facial não está pendente', 'cnpj não está pendente',
    'address não está pendente', 'Dados não estão pendentes',
  ])('400 "%s" é já decidido', (msg) => {
    expect(isVerificationAlreadyDecided(http(400, msg))).toBe(true);
  });
  it('outros erros não são', () => {
    expect(isVerificationAlreadyDecided(http(400, 'Usuário inválido'))).toBe(false);
    expect(isVerificationAlreadyDecided(http(404, 'Usuário não encontrado'))).toBe(false);
    expect(isVerificationAlreadyDecided(http(409, 'Documento não está pendente'))).toBe(false);
    expect(isVerificationAlreadyDecided(http(500, 'Erro interno do servidor'))).toBe(false);
    expect(isVerificationAlreadyDecided(new Error('x'))).toBe(false);
  });
});
