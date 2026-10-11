import { useRouter } from 'next/router';
import { AlertTriangle } from 'lucide-react';
import { ErrorScreen } from '../components/drop/ErrorScreen';
import { ROUTES } from '../lib/routes';

export default function ServerError() {
  const router = useRouter();
  return (
    <ErrorScreen
      icon={<AlertTriangle size={28} />}
      title="Erro nosso"
      description="Algo falhou do nosso lado. Tente de novo; se continuar, fale com o suporte."
      primary={{ label: 'Tentar de novo', onClick: () => router.reload() }}
      secondary={{ label: 'Ir para o Início', onClick: () => router.push(ROUTES.inicio) }}
    />
  );
}
