/**
 * Fase 4 · Fatia 1 — repositório de User.
 *
 * O foco destes testes é a cifra de `bankInfo`: no Mongoose isso era invisível,
 * feito por hooks (`pre('save')` e `post(/^findOne/)` em src/models/User.ts).
 * O Prisma não tem hooks equivalentes, então o comportamento vira explícito — e
 * se alguém removê-lo, o dado bancário vai para o banco em texto puro.
 */

import { prisma } from '../lib/prisma';
import { decryptSensitiveData } from '../utils/encryption';
import userRepository from '../repositories/user.repository';

const email = () => `repo_${Math.random().toString(36).slice(2, 10)}@drop.test`;
const created: string[] = [];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('userRepository', () => {
  it('cria e busca por email', async () => {
    const e = email();
    const user = await userRepository.create({ name: 'Fulano', email: e, passwordHash: 'h' });
    created.push(user.id);

    const found = await userRepository.findByEmail(e);
    expect(found?.name).toBe('Fulano');
  });

  it('cifra bankInfo em repouso e NÃO grava em texto puro', async () => {
    const user = await userRepository.create({ name: 'Bank', email: email(), passwordHash: 'h' });
    created.push(user.id);

    await userRepository.update(user.id, {
      bankInfo: { isConfigured: true, bank: '001', agency: '1234', account: '56789-0' },
    });

    // no banco: só o campo cifrado
    const raw = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(raw.bankInfo).toBeNull();
    expect(raw.bankInfoEncrypted).toBeTruthy();
    expect(String(raw.bankInfoEncrypted)).not.toContain('56789-0');
    expect(JSON.parse(decryptSensitiveData(raw.bankInfoEncrypted!)).account).toBe('56789-0');
  });

  it('decifra bankInfo ao ler', async () => {
    const user = await userRepository.create({ name: 'Bank2', email: email(), passwordHash: 'h' });
    created.push(user.id);
    await userRepository.update(user.id, {
      bankInfo: { isConfigured: true, bank: '237', agency: '1', account: '99' },
    });

    const found = await userRepository.findById(user.id);
    expect((found?.bankInfo as any)?.account).toBe('99');
  });

  it('bankInfo corrompido devolve null em vez de lançar', async () => {
    const user = await userRepository.create({ name: 'Bank3', email: email(), passwordHash: 'h' });
    created.push(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { bankInfoEncrypted: 'lixo-que-nao-decifra' },
    });

    const found = await userRepository.findById(user.id);
    expect(found?.bankInfo).toBeNull();
  });
});
