import { Response } from 'express';
import { Address } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types';

/**
 * Endereços do usuário.
 *
 * `User.addresses[]` era um array de subdocumentos no Mongo; virou a tabela
 * `Address` com FK. A API pública NÃO muda: as rotas de editar/remover seguem
 * recebendo um ÍNDICE posicional, e a resposta segue sendo a lista de endereços
 * com `_id` (o frontend lê esse campo).
 *
 * A ordem precisa ser estável para o índice significar sempre a mesma coisa —
 * ordenamos por `id`, que é `cuid()` e cresce com o tempo de criação, ou seja,
 * reproduz a ordem de inserção que o array tinha.
 */

/** Devolve os endereços na ordem estável, com `_id` para compatibilidade. */
async function listOrdered(userId: string): Promise<Array<Address & { _id: string }>> {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
  });
  return addresses.map((a) => ({ ...a, _id: a.id }));
}

// Adiciona um novo endereço ao usuário autenticado
export const addAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const {
      label, street, number, neighborhood, city, state, cep, latitude, longitude, setAsDefault
    } = req.body;
    if (!street || !number || !neighborhood || !city || !state || !cep || !latitude || !longitude) {
      return res.status(400).json({ error: 'Preencha todos os campos do endereço' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    console.log(`[ADDRESS] POST /addresses para usuário ${user.name}:`);
    console.log(`  - Novo endereço: ${street}, ${number} (setAsDefault=${setAsDefault})`);

    await prisma.$transaction(async (tx) => {
      // Só pode haver um padrão: limpa os demais antes de inserir.
      if (setAsDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      await tx.address.create({
        data: {
          userId,
          label, street, number, neighborhood, city, state, cep, latitude, longitude,
          isDefault: setAsDefault || false,
        },
      });
    });

    const addresses = await listOrdered(userId);
    console.log(`  - Endereços DEPOIS: ${addresses.length}`);

    return res.status(201).json(addresses);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao adicionar endereço' });
  }
};

// Define o endereço padrão do usuário
export const setDefaultAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { addressId } = req.body;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const addresses = await listOrdered(userId);

    // Aceita o id do endereço ou, como antes, um índice posicional.
    let targetIdx = addresses.findIndex((a) => String(a.id) === String(addressId));
    if (targetIdx === -1 && addressId !== undefined && !isNaN(Number(addressId))) {
      targetIdx = Number(addressId);
    }

    const target = targetIdx >= 0 && targetIdx < addresses.length ? addresses[targetIdx] : null;
    if (!target) return res.status(404).json({ error: 'Endereço não encontrado' });

    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
      prisma.address.update({ where: { id: target.id }, data: { isDefault: true } }),
    ]);

    return res.json({ addresses: await listOrdered(userId) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao definir endereço padrão' });
  }
};

// Edita um endereço pelo índice
export const editAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { index } = req.params;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const addresses = await listOrdered(userId);
    if (typeof index === 'undefined' || isNaN(Number(index)) || Number(index) < 0 || Number(index) >= addresses.length) {
      return res.status(400).json({ error: 'Índice inválido' });
    }

    const {
      label = '', street = '', number = '', neighborhood = '', city = '', state = '', cep = '', latitude = '', longitude = ''
    } = req.body;
    // Validação igual ao addAddress
    if (!street || !number || !neighborhood || !city || !state || !cep || !latitude || !longitude) {
      return res.status(400).json({ error: 'Preencha todos os campos do endereço' });
    }

    const target = addresses[Number(index)];
    // isDefault é preservado: editar um endereço não muda qual é o padrão.
    await prisma.address.update({
      where: { id: target.id },
      data: { label, street, number, neighborhood, city, state, cep, latitude, longitude },
    });

    return res.json({ addresses: await listOrdered(userId) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao editar endereço' });
  }
};

// Lista todos os endereços do usuário autenticado
export const listAddresses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const addresses = await listOrdered(userId);

    console.log(`[ADDRESS] GET /addresses para usuário ${user.name} (${userId}):`);
    console.log(`  - Total de endereços no DB: ${addresses.length}`);
    addresses.forEach((addr, idx) => {
      console.log(`  [${idx}] ${addr.label || 'Sem apelido'} - ${addr.street}, ${addr.number} (isDefault=${addr.isDefault})`);
    });

    return res.json(addresses);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar endereços' });
  }
};

// Remove um endereço pelo índice
export const removeAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { index } = req.params;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const addresses = await listOrdered(userId);
    if (typeof index === 'undefined' || isNaN(Number(index)) || Number(index) < 0 || Number(index) >= addresses.length) {
      return res.status(400).json({ error: 'Índice inválido' });
    }

    await prisma.address.delete({ where: { id: addresses[Number(index)].id } });

    return res.json({ addresses: await listOrdered(userId) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao remover endereço' });
  }
};
