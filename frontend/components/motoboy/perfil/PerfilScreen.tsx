// frontend/components/motoboy/perfil/PerfilScreen.tsx
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Bike, Headphones, KeyRound, LogOut, ShieldCheck, User } from 'lucide-react';
import MotoboyShell from '../panel/MotoboyShell';
import { NavRow } from '../../panel/NavRow';
import { AreasSection } from '../../panel/AreasSection';
import blocks from '../../panel/PanelBlocks.module.css';
import MotoboyRatingsBlock from '../../MotoboyRatingsBlock';
import { Alert } from '../../ui/Alert';
import { Avatar } from '../../ui/Avatar';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';
import { imageUrl } from '../../../lib/config';
import { kycItems, kycSummary, type KycItem } from '../../../lib/motoboyCadastro';
import { monthYear } from '../../../lib/motoboyLevel';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { rejectionLine } from '../../../lib/verificationRejection';
import { readNightPref, writeNightPref } from '../../../lib/nightTheme';
import styles from './Perfil.module.css';

const ICON_TONE = { ok: blocks.icoOk, warn: blocks.icoWarn, err: blocks.icoErr, info: blocks.icoInfo } as const;
const COURIER_SUB: Record<KycItem['state'], string> = {
  done: 'Foto da placa aprovada',
  pending: 'Em análise',
  rejected: '',
  todo: 'Falta enviar',
};

/** Aba Perfil (protótipo 25). O conteúdo do perfil antigo virou menu. */
export function PerfilScreen() {
  const router = useRouter();
  const { user, logout } = useAuth() || ({} as any);
  const uid = String(user?.id || user?._id || '');
  const [kyc, setKyc] = useState<{ items: KycItem[]; verified: boolean; plate: string | null } | null>(null);
  const [kycFailed, setKycFailed] = useState(false);
  const [pix, setPix] = useState<{ has: boolean; key: string | null } | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Array<{ rating: number }> | null>(null);
  const [showRatings, setShowRatings] = useState(false);
  const [night, setNight] = useState(true);

  // Lido no cliente (o SSR não tem localStorage); falha = ligado.
  useEffect(() => { setNight(readNightPref()); }, []);

  const loadKyc = useCallback(() => {
    setKycFailed(false);
    Promise.all([api.get('/verification/me'), api.get('/verification/motoboy/me')])
      .then(([v, m]) => setKyc({ items: kycItems(v.data, m.data), verified: m.data?.verified === true, plate: m.data?.courier?.plate ? String(m.data.courier.plate) : null }))
      .catch(() => setKycFailed(true));
  }, []);
  useEffect(() => { loadKyc(); }, [loadKyc]);

  useEffect(() => {
    api.get('/onboarding/status').then((r) => setPix({ has: r.data?.hasPixKey === true || !!r.data?.pixKey, key: r.data?.pixKey || null })).catch(() => setPix(null));
    api.get('/user/me').then((r) => setSince(monthYear(r.data?.createdAt))).catch(() => setSince(null));
  }, []);

  useEffect(() => {
    if (!uid) return;
    api.get(`/deliveries/motoboy/${uid}/ratings`).then((r) => setRatings(Array.isArray(r.data) ? r.data : [])).catch(() => setRatings(null));
  }, [uid]);

  const toggleNight = (on: boolean) => { writeNightPref(on); setNight(on); };

  const avg = ratings && ratings.length ? ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ratings.length : null;
  const ratingText = avg != null ? `★ ${avg.toFixed(1).replace('.', ',')} (${ratings!.length})` : ratings ? 'Ainda sem avaliações' : null;
  const whoSub = [ratingText, since ? `desde ${since}` : null].filter(Boolean).join(' · ');

  const courier = kyc?.items.find((i) => i.key === 'courier');
  const summary = kyc ? kycSummary(kyc.items, kyc.verified) : null;

  return (
    <MotoboyShell title="Perfil">
      <div className={blocks.body}>
        <section className={[blocks.blk, styles.who].join(' ')} aria-label="Você">
          <Avatar name={user?.name || 'Entregador'} src={user?.photo ? imageUrl(user.photo) : null} size="lg" />
          <span className={styles.whoTx}>
            <b>{user?.name}</b>
            {whoSub && (ratings && ratings.length
              ? <button type="button" className={blocks.link} onClick={() => setShowRatings(true)}>{whoSub}</button>
              : <span>{whoSub}</span>)}
            <button type="button" className={blocks.link} onClick={() => router.push(MOTOBOY_ROUTES.perfilPublico(uid))}>Ver como o cliente vê</button>
          </span>
        </section>

        <h2 className={blocks.cap}>Veículo e documentos</h2>
        {kycFailed ? (
          <Alert tone="error" title="Não carregamos seus documentos" action={{ label: 'Tentar de novo', onClick: loadKyc }} />
        ) : (
          <ul className={blocks.list}>
            <li className={blocks.row}>
              <span className={[blocks.ico, courier?.state === 'done' ? blocks.icoOk : courier?.state === 'rejected' ? blocks.icoErr : ''].filter(Boolean).join(' ')} aria-hidden="true"><Bike size={18} /></span>
              <span className={blocks.tx}>
                <b>{kyc?.plate ? `Moto · ${kyc.plate}` : 'Moto e CNH'}</b>
                <span className={courier?.state === 'rejected' ? blocks.err : undefined}>
                  {!courier
                    ? 'Carregando…'
                    : courier.state === 'rejected'
                      ? rejectionLine(courier.reason, courier.resend, { word: 'Recusada', fallback: 'envie de novo' })
                      : COURIER_SUB[courier.state]}
                </span>
              </span>
            </li>
            {summary && (summary.action ? (
              <NavRow
                icon={<ShieldCheck size={20} />}
                iconClassName={ICON_TONE[summary.tone]}
                label={summary.title}
                sub={summary.sub}
                end={<span className={[blocks.tag, summary.action === 'refazer' ? blocks.tagErr : blocks.tagWarn].join(' ')}>{summary.action === 'refazer' ? 'Refazer' : 'Continuar'}</span>}
                onClick={() => router.push(`${MOTOBOY_ROUTES.cadastro}?etapa=verificacao`)}
              />
            ) : (
              <li className={blocks.row}>
                <span className={[blocks.ico, ICON_TONE[summary.tone]].join(' ')} aria-hidden="true"><ShieldCheck size={18} /></span>
                <span className={blocks.tx}><b>{summary.title}</b><span>{summary.sub}</span></span>
              </li>
            ))}
          </ul>
        )}

        <h2 className={blocks.cap}>Recebimento e preferências</h2>
        <ul className={blocks.list}>
          <NavRow
            icon={<KeyRound size={20} />}
            label="Chave Pix"
            sub={pix ? (pix.has ? pix.key || 'Cadastrada' : 'Cadastre para receber') : 'Toque para ver'}
            onClick={() => router.push(MOTOBOY_ROUTES.recebimento)}
          />
          <li className={styles.switchRow}>
            <Switch label="Tela escura à noite" description="Automático das 18h às 6h" checked={night} onChange={toggleNight} />
          </li>
        </ul>

        <AreasSection />

        <ul className={blocks.list}>
          <NavRow icon={<User size={20} />} label="Dados e senha" sub="E-mail, celular, alterar senha" onClick={() => router.push(MOTOBOY_ROUTES.perfilDados)} />
          <NavRow icon={<Headphones size={20} />} label="Ajuda e suporte" sub="Chat com a equipe DROP" onClick={() => router.push(MOTOBOY_ROUTES.perfilAjuda)} />
          <li>
            <button type="button" className={[blocks.row, blocks.rowButton].join(' ')} onClick={() => logout?.()}>
              <span className={[blocks.ico, blocks.icoErr].join(' ')} aria-hidden="true"><LogOut size={18} /></span>
              <span className={blocks.tx}><b className={blocks.err}>Sair</b></span>
            </button>
          </li>
        </ul>
      </div>

      <Sheet open={showRatings} onClose={() => setShowRatings(false)} title="Suas avaliações">
        {showRatings && <MotoboyRatingsBlock motoboyId={uid} />}
      </Sheet>
    </MotoboyShell>
  );
}

export default PerfilScreen;
