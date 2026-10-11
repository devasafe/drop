import { useRouter } from 'next/router';
import { Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ErrorScreen } from '../components/drop/ErrorScreen';
import { getFinalDestination } from '../lib/onboardingFlow';
import { ROUTES } from '../lib/routes';

const PERFIL: Record<string, string> = { cliente: 'cliente', lojista: 'loja', motoboy: 'motoboy' };

export default function AccessDenied() {
  const router = useRouter();
  const { user } = useAuth() || ({} as any);
  const role = user?.activeRole || user?.role || 'cliente';
  const cliente = role === 'cliente';
  return (
    <ErrorScreen
      icon={<Lock size={28} />}
      title="Esta área não é do seu perfil"
      description={`Você entrou como ${PERFIL[role] ?? role}. Esta parte é de outro perfil.`}
      secondary={user?.roles && user.roles.length > 1
        ? { label: 'Trocar de perfil', onClick: () => router.push(ROUTES.inicio) }
        : undefined}
      primary={cliente
        ? { label: 'Ir para o Início', onClick: () => router.push(ROUTES.inicio) }
        : { label: 'Voltar para o painel', onClick: () => router.push(getFinalDestination(role)) }}
    />
  );
}
