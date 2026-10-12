import { maskPixKey, looksMaskedPixKey } from '../utils/maskPixKey';

describe('maskPixKey', () => {
  it('CPF: ***.456.789-**', () => {
    expect(maskPixKey('12345678901', 'CPF')).toBe('***.456.789-**');
    expect(maskPixKey('123.456.789-01')).toBe('***.456.789-**');
  });

  it('e-mail: primeira letra + *** + domínio', () => {
    expect(maskPixKey('ana@x.com', 'EMAIL')).toBe('a***@x.com');
    expect(maskPixKey('ana@x.com')).toBe('a***@x.com');
  });

  it('telefone: só os 4 últimos dígitos', () => {
    expect(maskPixKey('+5511987654321', 'PHONE')).toBe('(**) *****-4321');
    expect(maskPixKey('+5511987654321')).toBe('(**) *****-4321');
    // o tipo gravado vence a inferência (11 dígitos sem tipo seriam lidos como CPF)
    expect(maskPixKey('11987654321', 'PHONE')).toBe('(**) *****-4321');
  });

  it('aleatória: 4 primeiros + … + 4 últimos', () => {
    expect(maskPixKey('123e4567-e89b-12d3-a456-426614174000', 'EVP')).toBe('123e…4000');
    expect(maskPixKey('123e4567-e89b-12d3-a456-426614174000')).toBe('123e…4000');
  });

  it('CNPJ: **.***.456/0001-**', () => {
    expect(maskPixKey('12345456000190', 'CNPJ')).toBe('**.***.456/0001-**');
    expect(maskPixKey('12.345.456/0001-90')).toBe('**.***.456/0001-**');
  });

  it('sem chave → null', () => {
    expect(maskPixKey(null)).toBeNull();
    expect(maskPixKey(undefined)).toBeNull();
    expect(maskPixKey('   ')).toBeNull();
  });

  it('chave curta ou fora do formato do tipo nunca sai inteira', () => {
    expect(maskPixKey('abc', 'EVP')).toBe('****');
    expect(maskPixKey('123', 'CPF')).toBe('****');
    expect(maskPixKey('x', 'EMAIL')).toBe('****');
  });

  it('nenhuma saída contém a chave original', () => {
    const keys: Array<[string, string?]> = [
      ['12345678901', 'CPF'], ['ana.souza@gmail.com', 'EMAIL'], ['+5521999998888', 'PHONE'],
      ['123e4567-e89b-12d3-a456-426614174000', 'EVP'], ['12345456000190', 'CNPJ'],
    ];
    for (const [k, t] of keys) {
      const masked = maskPixKey(k, t)!;
      expect(masked).not.toBe(k);
      expect(masked.includes(k)).toBe(false);
    }
  });
});

describe('looksMaskedPixKey', () => {
  it('reconhece a chave que veio mascarada da tela', () => {
    expect(looksMaskedPixKey('***.456.789-**')).toBe(true);
    expect(looksMaskedPixKey('a***@x.com')).toBe(true);
    expect(looksMaskedPixKey('123e…4000')).toBe(true);
  });
  it('não acusa chave real', () => {
    expect(looksMaskedPixKey('12345678901')).toBe(false);
    expect(looksMaskedPixKey('ana@x.com')).toBe(false);
    expect(looksMaskedPixKey('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    expect(looksMaskedPixKey(undefined)).toBe(false);
  });
});
