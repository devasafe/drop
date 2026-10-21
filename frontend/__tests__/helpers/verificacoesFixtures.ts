/** Filas de verificação de teste (formato das respostas de /verification/admin/*). D3a · P3.2. */
export const CLIENTE = {
  _id: 'c1', name: 'Ana Souza', email: 'ana@x.com', roles: ['cliente'],
  verification: { document: { status: 'pending', type: 'rg', number: '12.345.678-9', frontUrl: 'https://cdn.x/ana-frente.jpg', backUrl: 'https://cdn.x/ana-verso.jpg' } },
};
export const PAULO_DOC = {
  _id: 'l2', name: 'Paulo Henrique', email: 'paulo@eletro.com', roles: ['cliente', 'lojista'],
  verification: { document: { status: 'pending', type: 'cnh', number: '998877', frontUrl: 'https://cdn.x/frente.jpg', backUrl: 'https://cdn.x/verso.jpg' } },
};
export const PAULO_FACIAL = {
  _id: 'l2', name: 'Paulo Henrique', roles: ['cliente', 'lojista'],
  verification: { facial: { status: 'pending', selfieUrl: 'https://cdn.x/selfie.jpg' } },
};
export const LOJA = {
  _id: 's1', name: 'Eletro Center',
  ownerId: { _id: 'l2', name: 'Paulo Henrique', roles: ['cliente', 'lojista'] },
  street: 'Rua Augusta', number: '100', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', zip: '01305-000',
  verification: {
    cnpj: { status: 'pending', number: '12.345.678/0001-90', razaoSocial: 'Eletro Center LTDA', situacao: 'ATIVA' },
    address: { status: 'pending', comprovanteUrl: 'https://cdn.x/conta-luz.jpg' },
  },
};
export const MOTOBOY = {
  _id: 'm1', name: 'Carlos Lima', email: 'carlos@x.com', roles: ['motoboy'],
  verification: {
    courier: { status: 'pending', cnhNumber: '0099', plate: 'ABC1D23', cnhPhotoUrl: 'https://cdn.x/cnh.jpg', platePhotoUrl: 'https://cdn.x/placa.jpg' },
    facial: { status: 'pending', selfieUrl: 'https://cdn.x/carlos-selfie.jpg' },
  },
};

/** `stats` (D3b-2b): a resposta de GET /verification/admin/stats, ou um Error para a leitura falhar. */
export interface QueueFixture { pending?: unknown[]; stores?: unknown[]; facial?: unknown[]; motoboys?: unknown[]; stats?: unknown }

export const STATS_URL = '/verification/admin/stats';

/** Só as leituras das filas (sem a média de espera), na ordem em que foram feitas. */
export function queueCalls(get: jest.Mock): string[] {
  return get.mock.calls.map((c) => String(c[0])).filter((u) => u !== STATS_URL);
}

/** Paulo (lojista: documento, selfie, CNPJ, endereço), Carlos (motoboy: selfie, CNH e placa), Ana (cliente: documento). */
export const FULL: QueueFixture = { pending: [CLIENTE, PAULO_DOC], stores: [LOJA], facial: [PAULO_FACIAL], motoboys: [MOTOBOY] };

/** api.get mockado por URL. */
export function queuesGet(q: QueueFixture) {
  return (url: string) => {
    if (url === '/verification/admin/pending') return Promise.resolve({ data: { count: (q.pending ?? []).length, items: q.pending ?? [] } });
    if (url === '/verification/admin/store-pending') return Promise.resolve({ data: { stores: q.stores ?? [], facialPendingOwners: q.facial ?? [] } });
    if (url === '/verification/admin/motoboy-pending') return Promise.resolve({ data: { count: (q.motoboys ?? []).length, items: q.motoboys ?? [] } });
    if (url === STATS_URL) {
      return q.stats instanceof Error
        ? Promise.reject(q.stats)
        : Promise.resolve({ data: q.stats ?? { avgHoursToDecision: null, decisions30d: 0 } });
    }
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  };
}
