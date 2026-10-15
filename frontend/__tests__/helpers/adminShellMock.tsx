import type { ReactNode } from 'react';

/**
 * Casca do admin para testes de página (P2–P5). A página continua testada sem o menu, o modo e os contadores:
 *   jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
 */
export function AdminShellMock({ title, actions, children }: { title: string; actions?: ReactNode; tabs?: string; children?: ReactNode }) {
  return (
    <div data-testid="admin-shell">
      <h1>{title}</h1>
      {actions}
      {children}
    </div>
  );
}

export { AdminShellMock as AdminShell };
export default AdminShellMock;
