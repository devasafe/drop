/**
 * D3a · testes das telas do admin (P2–P5).
 * - renderAdminPage: a página com o AuthContext REAL (useAuth e useContext(AuthContext) funcionam) e o
 *   ProtectedRoute real, para o teste de permissão provar o portão de verdade.
 * - stubNativeDialogs + confirmIfAsked: o teste de caracterização roda na página antiga (window.confirm aceito)
 *   e na nova (AdminSheet: clica no botão principal).
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ContextType, ReactElement } from 'react';
import AuthContext from '../../contexts/AuthContext';

export type AdminAuthValue = NonNullable<ContextType<typeof AuthContext>>;

/** Sessão de teste: o `can` é o mesmo do AuthContext (CEO e '*' liberam tudo). */
export function adminAuth(role: string, perms: string[] = []): AdminAuthValue {
  const can = (p: string) => role === 'ceo' || perms.includes('*') || perms.includes(p);
  return {
    user: { id: 'u1', _id: 'u1', name: 'Marina Rocha', email: 'marina@drop.app', role, activeRole: role },
    token: null,
    loading: false,
    activeRole: role,
    permissions: perms,
    teamRoles: [],
    permissionsLoading: false,
    can,
    login: jest.fn(),
    logout: jest.fn(),
    switchRole: jest.fn(),
    setUser: jest.fn(),
    acceptSession: jest.fn(),
  } as AdminAuthValue;
}

export function renderAdminPage(ui: ReactElement, auth: AdminAuthValue = adminAuth('ceo')) {
  return render(<AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>);
}

/** Página antiga: confirm aceito, alert e prompt silenciosos. Devolve os mocks para conferir. */
export function stubNativeDialogs() {
  const confirm = jest.fn(() => true);
  const alert = jest.fn();
  const prompt = jest.fn(() => '');
  Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: confirm });
  Object.defineProperty(window, 'alert', { configurable: true, writable: true, value: alert });
  Object.defineProperty(window, 'prompt', { configurable: true, writable: true, value: prompt });
  return { confirm, alert, prompt };
}

/** Página nova: se uma AdminSheet abriu, clica no botão principal dela. Na antiga não há diálogo e nada acontece. */
export async function confirmIfAsked(name: RegExp | string): Promise<void> {
  const dialog = screen.queryByRole('dialog');
  if (!dialog) return;
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name }));
  });
}
