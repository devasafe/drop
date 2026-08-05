import { useEffect, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle2, Clock, Upload } from 'lucide-react';
import api from '../lib/api';
import { maskCPF, maskRG, onlyDigits, cleanRG } from '../lib/masks';
import OnboardingProgress from '../components/OnboardingProgress';
import OnboardingFooter from '../components/OnboardingFooter';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Chip } from '../components/ui/Chip';
import styles from './Verificacao.module.css';

type DocStatus = 'none' | 'pending' | 'approved' | 'rejected';
interface Verification {
  email: { status: string };
  phone: { status: string };
  document: { status: DocStatus; rejectionReason?: string; type?: string };
}

export default function VerificacaoPage() {
  const [v, setV] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // email (código)
  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');

  // documento — o número vem do cadastro (editar-conta), não é digitado aqui
  const [docType, setDocType] = useState<'cpf' | 'rg'>('cpf');
  const [account, setAccount] = useState<{ cpf: string; rg: string }>({ cpf: '', rg: '' });
  // Número digitado aqui quando ainda não há CPF/RG no cadastro (cadastro mínimo).
  const [docNumber, setDocNumber] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  const [msg, setMsg] = useState('');

  const router = useRouter();
  const onboarding = router.query.onboarding === '1';

  const load = async () => {
    try {
      const [vRes, uRes] = await Promise.all([
        api.get('/verification/me'),
        api.get('/user/me'),
      ]);
      setV(vRes.data.verification);
      const cpf = uRes.data?.cpf || '';
      const rg = uRes.data?.rg || '';
      setAccount({ cpf, rg });
      // Seleciona por padrão um documento que o usuário realmente cadastrou
      setDocType(cpf ? 'cpf' : rg ? 'rg' : 'cpf');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Faça login para acessar a verificação.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const action = async (fn: () => Promise<any>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'Erro na operação.'); }
  };

  const resendEmail = () => action(async () => { await api.post('/verification/email/resend'); setEmailSent(true); }, 'Código enviado! Confira seu email.');
  const verifyEmailCode = () => action(() => api.post('/verification/email/verify', { code: emailCode }), 'Email verificado!');
  const submitDoc = () => action(async () => {
    if (!front || !back) throw { response: { data: { error: 'Envie frente e verso.' } } };
    // Se o número ainda não está no cadastro, salva agora (PATCH /user/me) antes do envio.
    const alreadyHas = docType === 'cpf' ? !!account.cpf : !!account.rg;
    if (!alreadyHas) {
      const digits = docType === 'cpf' ? onlyDigits(docNumber) : cleanRG(docNumber);
      if (!digits) throw { response: { data: { error: `Informe o número do ${docType.toUpperCase()}.` } } };
      await api.patch('/user/me', { [docType]: digits });
    }
    const fd = new FormData();
    fd.append('type', docType);
    fd.append('front', front);
    fd.append('back', back);
    await api.post('/verification/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Documento enviado para análise.');

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.loadingText}>Carregando...</p>
        </div>
      </div>
    );
  }
  if (err) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.errorText}>{err}</p>
        </div>
      </div>
    );
  }

  const emailOk = v?.email?.status === 'verified';
  const docStatus = v?.document?.status || 'none';
  const allOk = emailOk && docStatus === 'approved';

  const hasCpf = !!account.cpf;
  const hasRg = !!account.rg;
  const hasSelectedNumber = docType === 'cpf' ? hasCpf : hasRg;
  const selectedNumber = docType === 'cpf' ? account.cpf : account.rg;
  const maskedNumber = docType === 'cpf' ? maskCPF(selectedNumber) : maskRG(selectedNumber);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <OnboardingProgress />

        <div className={styles.header}>
          <h1 className={styles.title}>Verificação da conta</h1>
          {!onboarding && <a href="/" className={styles.laterLink}>Verificar depois →</a>}
        </div>
        <p className={`${styles.subtitle} ${allOk ? styles.subtitleOk : ''}`}>
          {allOk && <CheckCircle2 size={16} aria-hidden="true" />}
          {allOk
            ? 'Sua conta está totalmente verificada — você já pode comprar.'
            : 'Conclua os passos abaixo para liberar suas compras.'}
        </p>
        {msg && <div className={styles.banner}>{msg}</div>}

        {/* Email */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Email</h2>
            <StatusBadge ok={emailOk} />
          </div>
          {!emailOk && (
            <>
              <p className={styles.hint}>Enviaremos um código de 6 dígitos para o seu email.</p>
              <Button variant="primary" size="sm" onClick={resendEmail}>Enviar código</Button>
              {emailSent && (
                <div className={styles.codeRow}>
                  <Input
                    value={emailCode}
                    onChange={setEmailCode}
                    placeholder="Código de 6 dígitos"
                    inputMode="numeric"
                    maxLength={6}
                    aria-label="Código de verificação"
                  />
                  <Button variant="primary" size="sm" onClick={verifyEmailCode}>Verificar código</Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Documento */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Documento (CPF ou RG)</h2>
            <StatusBadge ok={docStatus === 'approved'} pending={docStatus === 'pending'} />
          </div>
          {docStatus === 'pending' && (
            <p className={styles.hint}><Clock size={14} aria-hidden="true" /> Em análise pela nossa equipe.</p>
          )}
          {docStatus === 'rejected' && (
            <p className={styles.hintDanger}>Recusado: {v?.document?.rejectionReason || 'reenvie com fotos legíveis.'}</p>
          )}
          {(docStatus === 'none' || docStatus === 'rejected') && (
            <>
              <p className={styles.hint}>Escolha o tipo de documento, informe o número e envie as fotos da frente e do verso.</p>
              <div className={styles.chipRow}>
                <Chip label="CPF" active={docType === 'cpf'} onClick={() => setDocType('cpf')} />
                <Chip label="RG" active={docType === 'rg'} onClick={() => setDocType('rg')} />
              </div>
              <label className={styles.fieldLabel}>Número do {docType.toUpperCase()}</label>
              <div className={styles.numberField}>
                {hasSelectedNumber ? (
                  <Input value={maskedNumber} onChange={() => {}} disabled aria-label="Número do documento" />
                ) : (
                  <Input
                    value={docNumber}
                    onChange={(val) => setDocNumber(docType === 'cpf' ? maskCPF(val) : maskRG(val))}
                    placeholder={docType === 'cpf' ? '000.000.000-00' : '00.000.000-0'}
                    inputMode={docType === 'cpf' ? 'numeric' : 'text'}
                    maxLength={docType === 'cpf' ? 14 : 12}
                    aria-label="Número do documento"
                  />
                )}
              </div>
              {hasSelectedNumber && (
                <p className={styles.hintSmall}>
                  Para alterar este número, edite em <a href="/editar-conta" className={styles.link}>Editar meus dados</a>.
                </p>
              )}

              <div className={styles.uploadRow}>
                <DropzoneField label="Frente" file={front} onChange={setFront} />
                <DropzoneField label="Verso" file={back} onChange={setBack} />
              </div>

              <Button variant="primary" onClick={submitDoc} className={styles.submitBtn}>Enviar documento</Button>
            </>
          )}
        </section>
      </div>
      <OnboardingFooter />
    </div>
  );
}

function StatusBadge({ ok, pending }: { ok?: boolean; pending?: boolean }) {
  const label = ok ? 'Verificado' : pending ? 'Em análise' : 'Pendente';
  const cls = ok ? styles.badgeDone : pending ? styles.badgePending : styles.badgeTodo;
  return (
    <span className={`${styles.badge} ${cls}`}>
      {ok && <CheckCircle2 size={12} aria-hidden="true" />}
      {label}
    </span>
  );
}

function DropzoneField({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.files?.[0] || null);
  return (
    <label className={`${styles.dropzone} ${file ? styles.dropzoneFilled : ''}`}>
      {file ? (
        <CheckCircle2 size={20} className={styles.dropIconFilled} aria-hidden="true" />
      ) : (
        <Upload size={20} className={styles.dropIcon} aria-hidden="true" />
      )}
      <span className={styles.dropText}>{file ? file.name : label}</span>
      <input
        type="file"
        accept="image/*"
        onChange={handleChange}
        className={styles.hiddenInput}
        aria-label={`Foto — ${label.toLowerCase()} do documento`}
      />
    </label>
  );
}
