import { unreadForUser } from '../utils/chatUnread';

describe('unreadForUser', () => {
  it('participant1 pega o índice 0', () => {
    expect(unreadForUser([0, 3], 'u1', 'u1')).toBe(0);
  });
  it('participant2 pega o índice 1', () => {
    expect(unreadForUser([2, 0], 'u1', 'u2')).toBe(0);
  });
  it('cenário do bug: enviei msg (não-lida pro outro) não conta pra mim', () => {
    // Eu = participant1 (u1); minha msg incrementa o índice do outro (1).
    expect(unreadForUser([0, 1], 'u1', 'u1')).toBe(0);
    // ...e conta pro outro (u2 = participant2).
    expect(unreadForUser([0, 1], 'u1', 'u2')).toBe(1);
  });
  it('array ausente/curto → 0', () => {
    expect(unreadForUser(undefined, 'u1', 'u1')).toBe(0);
    expect(unreadForUser(null, 'u1', 'u2')).toBe(0);
  });
});
