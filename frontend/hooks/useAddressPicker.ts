import { useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { ROUTES } from '../lib/routes';

/** Abre o seletor de endereço; convidado vai para o login (não tem endereço salvo). */
export function useAddressPicker() {
  const { user } = useAuth() || ({} as any);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const request = useCallback(() => { if (user) setOpen(true); else router.push(ROUTES.login); }, [user, router]);
  return { open, setOpen, request };
}
