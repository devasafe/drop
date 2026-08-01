import { matchesQuery, filterStores, filterProducts, productCategories, mapProductCard } from '../searchCatalog';

const stores = [{ _id: 's1', name: 'Pizza Place' }, { _id: 's2', name: 'Burger House' }];
const products = [
  { _id: 'p1', name: 'Pizza Calabresa', price: 40, category: 'Pizzas' },
  { _id: 'p2', name: 'X-Burger', price: 25, categoryId: 'Lanches' },
  { _id: 'p3', name: 'Pizza Marguerita', price: 38, category: 'Pizzas' },
];

describe('searchCatalog', () => {
  it('matchesQuery é case/acento-insensível nas pontas', () => {
    expect(matchesQuery('Pizza Calabresa', 'pizza')).toBe(true);
    expect(matchesQuery('Café', 'cafe')).toBe(true);
    expect(matchesQuery('X-Burger', 'sushi')).toBe(false);
    expect(matchesQuery('qualquer', '')).toBe(true);
  });
  it('filterStores por nome', () => {
    expect(filterStores(stores, 'pizza').map((s) => s._id)).toEqual(['s1']);
    expect(filterStores(stores, '').length).toBe(2);
  });
  it('filterProducts por query e categoria', () => {
    expect(filterProducts(products, 'pizza').map((p) => p._id)).toEqual(['p1', 'p3']);
    expect(filterProducts(products, '', 'Pizzas').map((p) => p._id)).toEqual(['p1', 'p3']);
    expect(filterProducts(products, 'marg', 'Pizzas').map((p) => p._id)).toEqual(['p3']);
  });
  it('productCategories únicas e ordenadas', () => {
    expect(productCategories(products)).toEqual([
      { id: 'Lanches', label: 'Lanches' },
      { id: 'Pizzas', label: 'Pizzas' },
    ]);
  });
  it('mapProductCard mapeia campos', () => {
    expect(mapProductCard({ name: 'Pizza', price: 40, image: 'x.jpg' }, 'Loja')).toMatchObject({
      name: 'Pizza', price: 40, store: 'Loja',
    });
  });
});
