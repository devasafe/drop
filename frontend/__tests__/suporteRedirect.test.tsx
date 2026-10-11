import { render } from '@testing-library/react';
import { ROUTES } from '../lib/routes';

const redirect = jest.fn();
jest.mock('../hooks/useClienteRedirect', () => ({ useClienteRedirect: (to: string | null) => redirect(to) }));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {} }) }));
jest.mock('../hooks/useRequireAuth', () => ({ __esModule: true, default: () => ({ user: null, loading: true }) }));
jest.mock('../hooks/useChat', () => ({ __esModule: true, default: () => ({ messages: [], setMessages: jest.fn(), joinConversation: jest.fn(), leaveConversation: jest.fn() }) }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => {}, emit: jest.fn(), isConnected: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})), post: jest.fn() } }));
import AuthContext from '../contexts/AuthContext';
import SuportePage from '../pages/suporte';

test('/suporte manda só o cliente para /conta/ajuda', () => {
  render(<AuthContext.Provider value={{ user: null, token: null } as any}><SuportePage /></AuthContext.Provider>);
  expect(redirect).toHaveBeenCalledWith(ROUTES.ajuda);
  expect(ROUTES.ajuda).toBe('/conta/ajuda');
});
