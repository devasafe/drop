import { maskCpfMiddle } from '../maskCpf';
it('mostra só o começo e o fim', () => {
  expect(maskCpfMiddle('529.982.247-25')).toBe('529.***.***-25');
  expect(maskCpfMiddle('52998224725')).toBe('529.***.***-25');
  expect(maskCpfMiddle('529.98')).toBe('');
});
