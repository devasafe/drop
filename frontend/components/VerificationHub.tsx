import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

type Step = 'done' | 'pending' | 'todo';

interface Section {
  title: string;
  desc: string;
  step: Step;
  href: string;
  cta: string;
}

const badge = (step: Step) => {
  const map: Record<Step, [string, string, string]> = {
    done: ['✅ Concluído', '#22C55E', 'rgba(34,197,94,0.12)'],
    pending: ['⏳ Em análise', '#F59E0B', 'rgba(245,158,11,0.12)'],
    todo: ['❌ Falta', '#EF4444', 'rgba(239,68,68,0.12)'],
  };
  const [label, color, bg] = map[step];
  return <span style={{ color, background: bg, border: `1px solid ${color}`, borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>;
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
  if (loading) return <p style={{ color: 'rgba(255,255,255,0.5)' }}>Carregando verificações…</p>;
  if (sections.length === 0) return null;

  const pend = sections.filter((s) => s.step !== 'done').length;

  return (
    <div>
      <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 4px' }}>
        {pend === 0 ? 'Tudo certo! Sua conta está completa. ✅' : `Você tem ${pend} item(ns) pendente(s).`}
      </p>
      {sections.map((s, i) => (
        <div key={i} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <strong style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{s.title}</strong>
            {badge(s.step)}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '8px 0 12px' }}>{s.desc}</p>
          <button style={btn} onClick={() => router.push(s.href)}>{s.cta} →</button>
        </div>
      ))}
    </div>
  );
}

const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18, marginTop: 12 };
const btn: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', color: '#C4B5FD', border: '1px solid #6C2BD9', borderRadius: 10, padding: '9px 16px', fontWeight: 600, cursor: 'pointer' };
