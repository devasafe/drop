import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';

/**
 * Cria um usuário dono e devolve o id, para usar em `Store.ownerId`.
 *
 * Existe porque `Store.owner → User` é FK de verdade no Postgres: onde os testes
 * antes jogavam um `new mongoose.Types.ObjectId()` solto, agora precisa haver um
 * usuário que existe. O e-mail usa `@owner.test` para o pgCleanup recolher.
 */
/**
 * ⚠️ `domain` NÃO é opcional por acidente: o Jest roda as suítes em paralelo e a
 * limpeza é por domínio de e-mail. Se duas suítes compartilhassem o mesmo domínio,
 * o afterEach de uma apagaria os donos da outra — e a cascata levaria Store e
 * Product junto, fazendo testes falharem com "null" sem explicação aparente.
 */
export async function ownerIdForStore(domain: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      name: 'Dono de Loja (teste)',
      email: `owner-${Date.now()}-${Math.random().toString(36).slice(2)}${domain}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'lojista',
      roles: ['lojista', 'cliente'],
      activeRole: 'lojista',
    },
  });
  return user.id;
}

/**
 * Cria uma loja (com dono) e devolve o id, para usar em `Product.storeId`.
 * `Product.storeId → Store` também é FK real — um ObjectId solto não passa mais.
 */
export async function storeIdForProduct(domain: string, name = 'Loja (teste)'): Promise<string> {
  const store = await prisma.store.create({
    data: { ownerId: await ownerIdForStore(domain), name, isOpen: true },
  });
  return store.id;
}
