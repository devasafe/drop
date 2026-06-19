import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import Icon from '../components/Icon';

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

export default function MinhaConta() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || ({} as any);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const role = user?.activeRole || user?.role;

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    load();
  }, [authLoading, user]);

  const load = async () => {
    setLoading(true);
    const secs: Section[] = [];
    try {
      // 1. Identidade da conta (compartilhada entre papéis): e-mail + documento
      const me = await api.get('/verification/me').then((r) => r.data).catch(() => null);
      const emailOk = me?.verification?.email?.status === 'verified';
      const docStatus = me?.verification?.document?.status;
      const idStep: Step = emailOk && docStatus === 'approved' ? 'done' : docStatus === 'pending' ? 'pending' : 'todo';
      secs.push({
        title: 'Identidade da conta',
        desc: 'E-mail e documento (CPF/RG). Vale para todos os seus perfis.',
        step: idStep,
        href: '/verificacao',
        cta: idStep === 'done' ? 'Ver' : 'Verificar',
      });

      if (role === 'motoboy') {
        const mb = await api.get('/verification/motoboy/me').then((r) => r.data).catch(() => null);
        const cs = mb?.courier?.status;
        const fs = mb?.facial?.status;
        const mbStep: Step = mb?.verified ? 'done' : (cs === 'pending' || fs === 'pending') ? 'pending' : 'todo';
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
        secs.push({ title: 'Dados da loja', desc: 'Nome, CNPJ, endereço e dados pessoais.', step: 'done', href: '/editar-conta', cta: 'Editar' });
        secs.push(await receivingSection());
      } else {
        // Cliente
        secs.push({ title: 'Endereços de entrega', desc: 'Gerencie seus endereços de entrega.', step: 'done', href: '/editar-conta', cta: 'Gerenciar' });
      }
    } finally {
      setSections(secs);
      setLoading(false);
    }
  };

  const receivingSection = async (): Promise<Section> => {
    const ob = await api.get('/onboarding/status').then((r) => r.data).catch(() => null);
    const step: Step = ob?.accountStatus === 'active' ? 'done' : ob?.accountStatus === 'pending' ? 'pending' : 'todo';
    return { title: 'Dados de recebimento', desc: 'Chave PIX e endereço para receber e sacar seu dinheiro.', step, href: '/dados-recebimento', cta: step === 'done' ? 'Ver' : 'Configurar' };
  };

  if (loading || authLoading) return <div style={wrap}><p>Carregando...</p></div>;

  const pend = sections.filter((s) => s.step !== 'done').length;

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 600, width: '100%' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', marginBottom: 4 }}>Minha Conta</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: 0 }}>
          {pend === 0 ? 'Tudo certo! Sua conta está completa. ✅' : `Você tem ${pend} item(ns) pendente(s) para completar.`}
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
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#0A0A0A', color: 'rgba(255,255,255,0.92)', display: 'flex', justifyContent: 'center', padding: 24 };
const card: React.CSSProperties = { background: '#161616', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18, marginTop: 14 };
const btn: React.CSSProperties = { background: 'rgba(108,43,217,0.15)', color: '#C4B5FD', border: '1px solid #6C2BD9', borderRadius: 10, padding: '9px 16px', fontWeight: 600, cursor: 'pointer' };
