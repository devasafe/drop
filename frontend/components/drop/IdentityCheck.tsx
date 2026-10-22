import { useCallback, useEffect, useState } from 'react';
import { Camera, Check, FileText, Mail } from 'lucide-react';
import api from '../../lib/api';
import { isValidCPF } from '../../lib/cpf';
import { maskCPF, onlyDigits } from '../../lib/masks';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Skeleton } from '../ui/Skeleton';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './IdentityCheck.module.css';

type DocStatus = 'none' | 'pending' | 'approved' | 'rejected';
interface Ver { email?: { status?: string }; document?: { status?: DocStatus; rejectionReason?: string; resendRequested?: boolean } }

/** Textos por público: o cliente verifica antes de comprar; a loja verifica o dono no cadastro. */
const COPY = {
  cliente: {
    lead: 'Pedimos uma vez, antes da primeira compra. Protege você contra uso indevido do seu cartão e do seu Pix.',
    wait: 'Leva até 1 dia útil. Você pode navegar e montar a sacola enquanto isso.',
  },
  loja: {
    lead: 'Confirmamos o e-mail e o documento do dono uma vez só. É o que garante que a loja é sua.',
    wait: 'Leva até 1 dia útil. Você pode seguir o cadastro da loja enquanto isso.',
  },
} as const;

/** Verificação de identidade (e-mail + documento) numa tela só (protótipo "Verificar identidade"). */
export function IdentityCheck({ onDone, emailResult, audience = 'cliente' }: { onDone?: () => void; emailResult?: 'ok' | 'erro' | null; audience?: 'cliente' | 'loja' }) {
  const copy = COPY[audience];
  const [ver, setVer] = useState<Ver | null>(null);
  const [failed, setFailed] = useState(false);
  const [cpf, setCpf] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([api.get('/verification/me'), api.get('/user/me')])
      .then(([v, me]) => { setVer(v.data?.verification || {}); if (me.data?.cpf) setCpf(maskCPF(String(me.data.cpf))); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return <Alert tone="error" title="Não carregamos sua verificação" action={{ label: 'Tentar de novo', onClick: load }} />;
  if (!ver) return <div className={styles.wrap}><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={120} /></div>;

  const emailOk = ver.email?.status === 'verified';
  const doc = (ver.document?.status || 'none') as DocStatus;
  const showForm = doc === 'none' || (doc === 'rejected' && retry);
  const cpfDigits = onlyDigits(cpf);
  const cpfState = cpfDigits.length < 11 ? null : isValidCPF(cpfDigits) ? 'ok' : 'bad';

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (err: any) { setError(err?.response?.data?.error || 'Não deu certo agora. Tente de novo.'); } finally { setBusy(false); }
  };
  const sendEmailCode = () => act(async () => { await api.post('/verification/email/resend'); setCodeSent(true); });
  const confirmEmail = () => act(async () => { await api.post('/verification/email/verify', { code }); setVer((v) => ({ ...v, email: { status: 'verified' } })); });
  const submitDoc = () => act(async () => {
    await api.patch('/user/me', { cpf: cpfDigits });
    const fd = new FormData();
    fd.append('type', 'cpf'); fd.append('front', front as File); fd.append('back', back as File);
    await api.post('/verification/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setVer((v) => ({ ...v, document: { status: 'pending' } })); setRetry(false);
  });

  const docLabel = doc === 'approved' ? 'Verificado' : doc === 'pending' ? 'Em análise' : doc === 'rejected' ? (ver.document?.resendRequested ? 'Reenvie' : 'Recusado') : 'Agora';
  const uploads: Array<[string, File | null, (f: File | null) => void]> = [['Frente', front, setFront], ['Verso', back, setBack]];

  return (
    <div className={styles.wrap}>
      {emailResult === 'ok' && <Alert tone="success" title="E-mail confirmado" />}
      {emailResult === 'erro' && <Alert tone="warning" title="Link inválido ou expirado" >Peça um código novo.</Alert>}
      <p className={styles.lead}>{copy.lead}</p>
      <ul className={styles.list}>
        <li className={styles.row}>
          <span className={emailOk ? styles.icoOk : styles.icoBrand} aria-hidden="true">{emailOk ? <Check size={18} /> : <Mail size={18} />}</span>
          <span className={styles.tx}><b>{emailOk ? 'E-mail confirmado' : 'Confirme seu e-mail'}</b><span>{emailOk ? 'Pronto' : 'Mandamos um código de 6 dígitos'}</span></span>
          {!emailOk && <span className={styles.badge}>Agora</span>}
        </li>
        <li className={styles.row}>
          <span className={doc === 'approved' ? styles.icoOk : styles.icoBrand} aria-hidden="true"><FileText size={18} /></span>
          <span className={styles.tx}><b>CPF e documento</b><span>Usado na nota e no Pix</span></span>
          <span className={styles.badge}>{docLabel}</span>
        </li>
      </ul>

      {!emailOk && (
        <div className={styles.block}>
          {!codeSent ? (
            <Button variant="secondary" onClick={sendEmailCode} loading={busy}>Enviar código</Button>
          ) : (
            <>
              <Input id="kyc-code" label="Código do e-mail" inputMode="numeric" maxLength={6} value={code}
                onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} />
              <Button variant="secondary" onClick={confirmEmail} loading={busy} disabled={code.length !== 6}>Confirmar</Button>
            </>
          )}
        </div>
      )}

      {doc === 'pending' && <Alert tone="warning" title="Documento em análise">{copy.wait}</Alert>}
      {doc === 'approved' && emailOk && <Alert tone="success" title="Tudo certo">Sua conta está verificada.</Alert>}
      {doc === 'rejected' && !retry && (
        <Alert
          tone="error"
          title={ver.document?.resendRequested ? 'Reenvie o documento' : 'Documento recusado'}
          action={{ label: 'Enviar de novo', onClick: () => setRetry(true) }}
        >
          {ver.document?.rejectionReason || 'Envie fotos nítidas da frente e do verso.'}
        </Alert>
      )}

      {showForm && (
        <div className={styles.block}>
          <Input id="kyc-cpf" label="CPF" inputMode="numeric" value={cpf} onChange={(v) => setCpf(maskCPF(v))}
            error={cpfState === 'bad' ? 'CPF inválido' : undefined} />
          {cpfState === 'ok' && <p className={styles.okLine}><Check size={14} aria-hidden="true" /> CPF válido</p>}
          <p className={styles.cap}>Foto do documento (RG ou CNH)</p>
          <div className={styles.uploads}>
            {uploads.map(([label, file, set]) => (
              <label key={label} className={file ? styles.uploadDone : styles.upload}>
                {file ? <Check size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" /> : <Camera size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
                <b>{label}</b><span>{file ? 'enviada' : 'tirar foto'}</span>
                <input type="file" accept="image/*" capture="environment" aria-label={label} className={styles.file}
                  onChange={(e) => set(e.target.files?.[0] ?? null)} />
              </label>
            ))}
          </div>
          {error && <Alert tone="error" title={error} />}
          <Button onClick={submitDoc} loading={busy} disabled={cpfState !== 'ok' || !front || !back}>Enviar para análise</Button>
          <p className={styles.note}>{copy.wait}</p>
        </div>
      )}
      {!showForm && error && <Alert tone="error" title={error} />}
      {onDone && (doc === 'pending' || doc === 'approved') && <Button variant="secondary" onClick={onDone}>Continuar</Button>}
    </div>
  );
}
