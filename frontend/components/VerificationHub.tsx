import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import styles from './VerificationHub.module.css';

type Step = 'done' | 'pending' | 'todo';

interface Section {
  title: string;
  desc: string;
  step: Step;
  href: string;
  cta: string;
}

const badge = (step: Step) => {
  const map: Record<Step, [string, string]> = {
    done: ['✅ Concluído', styles.badgeDone],
    pending: ['⏳ Em análise', styles.badgePending],
    todo: ['❌ Falta', styles.badgeTodo],
  };
  const [label, cls] = map[step];
  return <span className={`${styles.badge} ${cls}`}>{label}</span>;
};

/**
 * Hub de verificações: mostra, num lugar só, o status de cada etapa do papel
 * ativo (identidade, documentos do papel, recebimento) com link pro fluxo existente.
 * Reutilizável — embutido em /user-profile e /motoboy/profile.
 */
export default function VerificationHub() {
  const router = useRouter();
  const { user } = useAuth() || ({} as any);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const role = user?.activeRole || user?.role;

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const receivingSection = async (): Promise<Section> => {
    const ob = await api.get('/onboarding/status').then((r) => r.data).catch(() => null);
    const step: Step = ob?.accountStatus === 'active' ? 'done' : ob?.accountStatus === 'pending' ? 'pending' : 'todo';
    return { title: 'Dados de recebimento', desc: 'Chave PIX e endereço para receber e sacar seu dinheiro.', step, href: '/dados-recebimento', cta: step === 'done' ? 'Ver' : 'Configurar' };
  };

  const load = async () => {
    setLoading(true);
    const secs: Section[] = [];
    try {
      const me = await api.get('/verification/me').then((r) => r.data).catch(() => null);
      const emailOk = me?.verification?.email?.status === 'verified';
      const docStatus = me?.verification?.document?.status;
      const idStep: Step = emailOk && docStatus === 'approved' ? 'done' : docStatus === 'pending' ? 'pending' : 'todo';
      secs.push({ title: 'Identidade da conta', desc: 'E-mail e documento (CPF/RG). Vale para todos os seus perfis.', step: idStep, href: '/verificacao', cta: idStep === 'done' ? 'Ver' : 'Verificar' });

      if (role === 'motoboy') {
        const mb = await api.get('/verification/motoboy/me').then((r) => r.data).catch(() => null);
        const mbStep: Step = mb?.verified ? 'done' : (mb?.courier?.status === 'pending' || mb?.facial?.status === 'pending') ? 'pending' : 'todo';
        secs.push({ title: 'Documentos de motoboy', desc: 'CNH, placa e selfie (facial).', step: mbStep, href: '/verificacao-motoboy', cta: mbStep === 'done' ? 'Ver' : 'Enviar' });
        secs.push(await receivingSection());
      } else if (role === 'lojista' || role === 'seller') {
        let storeId = '';
        try {
          const dash = await api.get('/stores/dashboard').then((r) => r.data);
          storeId = dash?.store?._id || dash?._id || dash?.storeId || '';
        } catch {}
        let storeStep: Step = 'todo';
        if (storeId) {
          const sv = await api.get(`/verification/store/${storeId}`).then((r) => r.data).catch(() => null);
          storeStep = sv?.isVerified ? 'done' : (sv?.cnpj?.status === 'pending' || sv?.address?.status === 'pending' || sv?.facial?.status === 'pending') ? 'pending' : 'todo';
        }
        secs.push({ title: 'Verificação da loja', desc: 'CNPJ, comprovante de endereço e selfie do dono.', step: storeStep, href: '/verificacao-loja', cta: storeStep === 'done' ? 'Ver' : 'Verificar' });
        secs.push(await receivingSection());
      }
    } finally {
      setSections(secs);
      setLoading(false);
    }
  };

  if (!user || role === 'cliente') {
    // Cliente: só identidade — mostra mesmo assim se quiser; aqui retornamos identidade.
  }
  if (loading) return <p className={styles.loading}>Carregando verificações…</p>;
  if (sections.length === 0) return null;

  const pend = sections.filter((s) => s.step !== 'done').length;

  return (
    <div>
      <p className={styles.intro}>
        {pend === 0 ? 'Tudo certo! Sua conta está completa. ✅' : `Você tem ${pend} item(ns) pendente(s).`}
      </p>
      {sections.map((s, i) => (
        <Card key={i} className={styles.card}>
          <div className={styles.cardHead}>
            <strong className={styles.cardTitle}>{s.title}</strong>
            {badge(s.step)}
          </div>
          <p className={styles.cardDesc}>{s.desc}</p>
          <Button variant="ghost" size="sm" onClick={() => router.push(s.href)}>{s.cta} →</Button>
        </Card>
      ))}
    </div>
  );
}
