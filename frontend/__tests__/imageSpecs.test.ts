// frontend/__tests__/imageSpecs.test.ts
/** Padrão de tamanho por área: dica de envio e checagem de tamanho mínimo. */
import { IMAGE_SPECS, specHint, checkMinSize } from '../lib/imageSpecs';

test('tabela: capa 3:1 1200 × 400, banners 2:1 1200 × 600, logo e avatar 400 × 400, produto 800 × 800', () => {
  expect(IMAGE_SPECS.cover).toMatchObject({ ratio: 3, width: 1200, height: 400 });
  expect(IMAGE_SPECS.featuredBanner).toMatchObject({ ratio: 2, width: 1200, height: 600 });
  expect(IMAGE_SPECS.promoBanner).toMatchObject({ ratio: 2, width: 1200, height: 600 });
  expect(IMAGE_SPECS.logo).toMatchObject({ ratio: 1, width: 400, height: 400 });
  expect(IMAGE_SPECS.product).toMatchObject({ ratio: 1, width: 800, height: 800 });
  expect(IMAGE_SPECS.avatar).toMatchObject({ ratio: 1, width: 400, height: 400 });
});

test('specHint: tamanho, formatos e limite', () => {
  expect(specHint(IMAGE_SPECS.cover)).toBe('1200 × 400 px · JPG, PNG ou WebP · até 5 MB');
  expect(specHint(IMAGE_SPECS.featuredBanner)).toBe('1200 × 600 px · JPG, PNG ou WebP · até 5 MB');
});

test('checkMinSize: abaixo do mínimo devolve a mensagem com os dois tamanhos', () => {
  expect(checkMinSize(800, 300, IMAGE_SPECS.cover)).toBe('Imagem pequena demais: precisa de pelo menos 1200 × 400 px (a sua tem 800 × 300).');
  expect(checkMinSize(1200, 399, IMAGE_SPECS.cover)).not.toBeNull();
  expect(checkMinSize(399, 1000, IMAGE_SPECS.logo)).not.toBeNull();
});

test('checkMinSize: no mínimo ou acima devolve null (a proporção é resolvida no recorte)', () => {
  expect(checkMinSize(1200, 400, IMAGE_SPECS.cover)).toBeNull();
  expect(checkMinSize(4000, 3000, IMAGE_SPECS.cover)).toBeNull();
  expect(checkMinSize(400, 400, IMAGE_SPECS.avatar)).toBeNull();
});
