/**
 * A apiKey da subconta Asaas não pode se perder ao atualizar o bloco `asaas`.
 *
 * HISTÓRIA: no Mongoose, `asaas.apiKeyEncrypted` era `select: false`. Quem carregasse
 * o usuário sem `select('+asaas.apiKeyEncrypted')`, mexesse no bloco e salvasse,
 * APAGAVA a chave — e sem ela a subconta fica inacessível (não dá para sacar).
 * Os dois testes originais fixavam esse par: o BUG e o FIX.
 *
 * DEPOIS DA MIGRAÇÃO: `asaas` é uma coluna JSONB e o Prisma sempre traz o objeto
 * inteiro, então a armadilha do `select: false` deixou de existir. O RISCO, porém,
 * não sumiu — mudou de forma: como o JSONB é gravado por inteiro, escrever um bloco
 * `asaas` parcial (montado do zero, sem a chave) sobrescreve e perde a apiKey.
 *
 * Estes testes seguem guardando a mesma propriedade, na forma que ela tem hoje:
 * o caminho correto preserva a chave, e o caminho parcial a destrói.
 */
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import userRepository from '../repositories/user.repository';
import { encryptSensitiveData } from '../utils/encryption';

afterEach(async () => {
  await cleanupUsersByEmailDomain('@akp.test');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeUserWithSubaccount() {
  return prisma.user.create({
    data: {
      name: 'Moto',
      email: `m-${Date.now()}-${Math.random().toString(36).slice(2)}@akp.test`,
      passwordHash: 'x',
      role: 'motoboy',
      asaas: {
        status: 'active',
        accountId: 'acc_1',
        walletId: 'w1',
        apiKeyEncrypted: encryptSensitiveData('$key'),
      },
    },
  });
}

describe('apiKeyEncrypted da subconta ao atualizar o bloco asaas', () => {
  it('FIX: alterar o bloco carregado preserva a apiKey', async () => {
    const u = await makeUserWithSubaccount();

    // Caminho correto (o que os services fazem): carrega o bloco inteiro,
    // altera um campo e regrava.
    const loaded = (await userRepository.findById(u.id)) as any;
    loaded.asaas.pixKey = '99991111140';
    await userRepository.update(u.id, { asaas: loaded.asaas });

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect((after?.asaas as any)?.apiKeyEncrypted).toBeTruthy();
    expect((after?.asaas as any)?.pixKey).toBe('99991111140');
    expect((after?.asaas as any)?.accountId).toBe('acc_1');
  });

  it('ARMADILHA: gravar um bloco asaas parcial APAGA a apiKey', async () => {
    const u = await makeUserWithSubaccount();

    // Caminho errado: monta o bloco do zero e regrava. Como o JSONB é substituído
    // por inteiro, tudo que não estiver aqui desaparece.
    await prisma.user.update({
      where: { id: u.id },
      data: { asaas: { status: 'active', pixKey: '99991111140' } },
    });

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect((after?.asaas as any)?.apiKeyEncrypted).toBeFalsy();
  });
});
