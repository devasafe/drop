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
  it('productCategories usa o nome como label (id = categoryId cuid)', () => {
    const prods = [
      { _id: 'x', name: 'X', categoryId: 'cat_abc123', categoryName: 'Eletrônicos' },
      { _id: 'y', name: 'Y', categoryId: 'cat_abc123', categoryName: 'Eletrônicos' },
    ];
    expect(productCategories(prods)).toEqual([{ id: 'cat_abc123', label: 'Eletrônicos' }]);
  });
  it('mapProductCard mapeia campos', () => {
    expect(mapProductCard({ name: 'Pizza', price: 40, image: 'x.jpg' }, 'Loja')).toMatchObject({
      name: 'Pizza', price: 40, store: 'Loja',
    });
  });

  it('mapProductCard: preço antigo maior → desconto (riscado + %)', () => {
    const card = mapProductCard({ name: 'X', price: 80, oldPrice: 100 });
    expect(card.oldPrice).toBe(100);
    expect(card.discountPercent).toBe(20);
  });

  it('mapProductCard: sem preço antigo ou menor/igual → sem desconto', () => {
    expect(mapProductCard({ name: 'X', price: 80 }).oldPrice).toBeUndefined();
    expect(mapProductCard({ name: 'X', price: 80 }).discountPercent).toBeUndefined();
    expect(mapProductCard({ name: 'X', price: 80, oldPrice: 80 }).oldPrice).toBeUndefined();
    expect(mapProductCard({ name: 'X', price: 80, oldPrice: 50 }).discountPercent).toBeUndefined();
  });
});
