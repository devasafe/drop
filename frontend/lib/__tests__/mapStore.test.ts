import { mapStore } from '../mapStore';

describe('mapStore', () => {
  it('mapeia nome, status por isOpen e categoria por bairro/cidade', () => {
    expect(mapStore({ name: 'Loja X', isOpen: true, neighborhood: 'Centro', city: 'Rio' }))
      .toMatchObject({ name: 'Loja X', status: 'aberta', category: 'Centro • Rio' });
    expect(mapStore({ name: 'Y', isOpen: false }).status).toBe('fechada');
    expect(mapStore({ name: 'Z', address: 'Rua 1' }).category).toBe('Rua 1');
    expect(mapStore({ name: 'W' }).category).toBe('Endereço não informado');
  });
});
