import { useRouter } from 'next/router';
import { SearchX } from 'lucide-react';
import { ErrorScreen } from '../components/drop/ErrorScreen';
import { ROUTES, buscarHref } from '../lib/routes';

export default function NotFound() {
  const router = useRouter();
  return (
    <ErrorScreen
      icon={<SearchX size={28} />}
      title="Esta página não existe"
      description="O link pode estar quebrado ou a página saiu do ar."
      primary={{ label: 'Buscar na DROP', onClick: () => router.push(buscarHref({ focus: true })) }}
      secondary={{ label: 'Ir para o Início', onClick: () => router.push(ROUTES.inicio) }}
    />
  );
}
