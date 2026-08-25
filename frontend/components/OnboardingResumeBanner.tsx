// frontend/components/OnboardingResumeBanner.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ListChecks } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { getFlow } from '../lib/onboardingFlow';
import { Button } from './ui/Button';
import { ICON_STROKE_WIDTH } from './ui/Icon';
import styles from './OnboardingResumeBanner.module.css';

// Retorna o path da 1ª etapa pendente do papel, ou null se nada pendente.
async function firstPendingPath(role?: string): Promise<string | null> {
  if (!role) return null;
  const flow = getFlow(role);
  if (flow.length === 0) return null;

  // FAIL SILENT: erro no endpoint primário → não exibe o banner (evita ruído em falha transitória).
  let ver: any;
  try {
    const r = await api.get('/verification/me');
    ver = r.data?.verification;
  } catch {
    return null;
  }

  // SUBMITTED = DONE: enviado (pending ou approved) conta como concluído; rejected/none volta ao banner.
  const submitted = (s?: string) => s === 'pending' || s === 'approved';

  const emailOk = ver?.email?.status === 'verified';
  const docOk = submitted(ver?.document?.status);
  const identidadeOk = emailOk && docOk;

  let pixOk = false;
  if (flow.some((s) => s.key === 'pix')) {
    try {
      const onb = await api.get('/onboarding/status').then((r) => r.data);
      pixOk = !!onb?.pixKey;
    } catch {}
  }

  // 'loja' (Criar loja) = a loja existe; 'lojaVerif' (Verificar loja) = verificação enviada.
  // São ETAPAS DIFERENTES no fluxo do lojista — não podem cair na mesma chave.
  let storeExists = false;
  let storeVerifOk = false;
  if (role === 'lojista') {
    try {
      const dash = await api.get('/stores/dashboard').then((r) => r.data);
      const storeId = dash?.store?._id || dash?._id || dash?.storeId;
      storeExists = !!storeId;
      if (storeId) {
        const sv = await api.get(`/verification/store/${storeId}`).then((r) => r.data);
        storeVerifOk =
          submitted(sv?.facial?.status) &&
          submitted(sv?.cnpj?.status) &&
          submitted(sv?.address?.status);
      }
    } catch {}
  }

  let motoboyOk = false;
  if (role === 'motoboy') {
    try {
      const mv = await api.get('/verification/motoboy/me').then((r) => r.data);
      motoboyOk = submitted(mv?.courier?.status) && submitted(mv?.facial?.status);
    } catch {}
  }

  const done: Record<string, boolean> = {
    identidade: identidadeOk,
    loja: storeExists,       // "Criar loja"
    lojaVerif: storeVerifOk, // "Verificar loja" (antes faltava esta chave → sempre pendente)
    motoboy: motoboyOk,
    pix: pixOk,
    plano: true, // plano é escolha, não bloqueia o banner
  };

  const pending = flow.find((s) => !done[s.key]);
  return pending ? pending.path : null;
}

export default function OnboardingResumeBanner() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.activeRole;
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    firstPendingPath(role).then((p) => { if (alive) setPath(p); });
    return () => { alive = false; };
  }, [role]);

  if (!path) return null;

  return (
    <div className={styles.banner} role="status">
      <div className={styles.text}>
        <ListChecks className={styles.icon} size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        <span>Sua conta ainda tem etapas pendentes.</span>
      </div>
      <Button variant="primary" size="sm" onClick={() => router.push(`${path}?onboarding=1`)}>
        Continuar configuração →
      </Button>
    </div>
  );
}
