import { saasTrialDaysLeft, saasTrialLabel, formatBillingDate } from '../saasBilling';

// Fim do teste: 23/10/2026 22:00 em São Paulo (= 24/10 01:00Z). O texto mostra "dia 23".
const END = '2026-10-24T01:00:00.000Z';

describe('saasTrialDaysLeft (dias de calendário em São Paulo)', () => {
  test('o mesmo número para qualquer hora de 14/10 em SP', () => {
    for (const iso of ['2026-10-14T03:00:00Z', '2026-10-14T12:00:00Z', '2026-10-15T02:59:59Z']) {
      expect(saasTrialDaysLeft(END, new Date(iso))).toBe(9);
    }
  });
  test('vira o dia à meia-noite de São Paulo, não à de UTC', () => {
    expect(saasTrialDaysLeft(END, new Date('2026-10-14T02:59:59Z'))).toBe(10); // 13/10 23:59 SP
    expect(saasTrialDaysLeft(END, new Date('2026-10-14T03:00:00Z'))).toBe(9); // 14/10 00:00 SP
    expect(saasTrialDaysLeft(END, new Date('2026-10-14T23:30:00Z'))).toBe(9); // 14/10 20:30 SP
    expect(saasTrialDaysLeft(END, new Date('2026-10-15T00:30:00Z'))).toBe(9); // 14/10 21:30 SP, já 15 em UTC
  });
  test('data final perto da meia-noite em SP: 23:59 SP e 00:01 SP', () => {
    expect(saasTrialDaysLeft('2026-10-24T02:59:00Z', new Date('2026-10-14T15:00:00Z'))).toBe(9); // dia 23, 23:59 SP
    expect(saasTrialDaysLeft('2026-10-23T03:01:00Z', new Date('2026-10-14T15:00:00Z'))).toBe(9); // dia 23, 00:01 SP
  });
  test('no dia final é 0 e depois é negativo', () => {
    expect(saasTrialDaysLeft(END, new Date('2026-10-23T15:00:00Z'))).toBe(0);
    expect(saasTrialDaysLeft(END, new Date('2026-10-24T15:00:00Z'))).toBe(-1);
  });
  test('diminui um por dia e bate com a data mostrada', () => {
    expect(formatBillingDate(END)).toBe('23/10/2026');
    expect(saasTrialDaysLeft(END, new Date('2026-10-13T15:00:00Z'))).toBe(10);
    expect(saasTrialDaysLeft(END, new Date('2026-10-14T15:00:00Z'))).toBe(9);
  });
  test('vazio/inválido', () => {
    expect(saasTrialDaysLeft(null, new Date())).toBeNull();
    expect(saasTrialDaysLeft('x', new Date())).toBeNull();
  });
});

describe('saasTrialLabel', () => {
  test('textos', () => {
    expect(saasTrialLabel(9)).toBe('Faltam 9 dias');
    expect(saasTrialLabel(1)).toBe('Falta 1 dia');
    expect(saasTrialLabel(0)).toBe('Último dia');
    expect(saasTrialLabel(-1)).toBe('Teste encerrado');
  });
});
