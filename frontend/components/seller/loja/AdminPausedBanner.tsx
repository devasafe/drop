/**
 * Faixa da loja pausada pelo DROP (D3b-2a, spec 7): o motivo e "Fale com o suporte", com o atalho para a Ajuda.
 * Aparece no Agora, na Loja e em Horários enquanto `adminPausedAt` existir.
 */
import { Alert } from '../../ui/Alert';
import { adminPausedText } from '../../../lib/storeAdminPause';

export interface AdminPausedBannerProps {
  reason: string | null;
  /** Leva à Ajuda do lojista. */
  onSupport?: () => void;
}

export function AdminPausedBanner({ reason, onSupport }: AdminPausedBannerProps) {
  return (
    <Alert tone="warning" action={onSupport ? { label: 'Falar com o suporte', onClick: onSupport } : undefined}>
      {adminPausedText(reason)}
    </Alert>
  );
}

export default AdminPausedBanner;
