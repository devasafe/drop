import { useEffect, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle2, Clock, XCircle, Upload } from 'lucide-react';
import api from '../lib/api';
import { maskCPF, maskRG, maskCNH, maskPlate } from '../lib/masks';
import OnboardingProgress from '../components/OnboardingProgress';
import OnboardingFooter from '../components/OnboardingFooter';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Chip } from '../components/ui/Chip';
import styles from './VerificacaoMotoboy.module.css';

type St = 'none' | 'pending' | 'approved' | 'rejected';
interface CourierVer {
  verified: boolean;
  missing: string[];
  courier: { status: St; plate?: string; cnhNumber?: string; rejectionReason?: string };
  facial: { status: St; rejectionReason?: string };
}
interface DocInfo {
  status: St;
  type?: string;
  number?: string;
  rejectionReason?: string;
}

export default function VerificacaoMotoboyPage() {
  const [ver, setVer] = useState<CourierVer | null>(null);
  const [doc, setDoc] = useState<DocInfo>({ status: 'none' });
  const [account, setAccount] = useState<{ cpf: string; rg: string }>({ cpf: '', rg: '' });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // documento
  const [docType, setDocType] = useState<'cpf' | 'rg'>('cpf');
  const [docFront, setDocFront] = useState<File | null>(null);
  const [docBack, setDocBack] = useState<File | null>(null);

  // facial
  const [selfie, setSelfie] = useState<File | null>(null);

  // CNH / placa
  const [cnh, setCnh] = useState('');
  const [plate, setPlate] = useState('');
  const [cnhPhoto, setCnhPhoto] = useState<File | null>(null);
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);
  const [editCourier, setEditCourier] = useState(false);

  const router = useRouter();
  const onboarding = router.query.onboarding === '1';

  const load = async () => {
    try {
      const [c, v, u] = await Promise.all([
        api.get('/verification/motoboy/me'),
        api.get('/verification/me').catch(() => ({ data: { verification: { document: { status: 'none' } } } })),
        api.get('/user/me').catch(() => ({ data: {} })),
      ]);
      setVer(c.data);
      setDoc(v.data?.verification?.document || { status: 'none' });
      const cpf = u.data?.cpf || '';
      const rg = u.data?.rg || '';
      setAccount({ cpf, rg });
      setDocType(cpf ? 'cpf' : rg ? 'rg' : 'cpf');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Faça login como motoboy para acessar.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'Erro na operação.'); }
  };

  const submitDoc = () => run(async () => {
    if (!docFront || !docBack) throw { response: { data: { error: 'Envie frente e verso do documento.' } } };
    const fd = new FormData();
    fd.append('type', docType);
    fd.append('front', docFront);
    fd.append('back', docBack);
    await api.post('/verification/document', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Documento enviado para análise.');

  const sendFacial = () => run(async () => {
    if (!selfie) throw { response: { data: { error: 'Selecione a selfie.' } } };
    const fd = new FormData();
    fd.append('selfie', selfie);
    await api.post('/verification/facial', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Selfie enviada para análise.');

  const sendCourier = () => run(async () => {
    const isFirst = (ver?.courier?.status || 'none') === 'none';
    // No 1º envio as duas fotos são obrigatórias; no reenvio pode mandar só a que quer trocar.
    if (isFirst && !cnhPhoto) throw { response: { data: { error: 'Selecione a foto da CNH.' } } };
    if (isFirst && !platePhoto) throw { response: { data: { error: 'Selecione a foto da placa.' } } };
    const fd = new FormData();
    fd.append('cnhNumber', cnh);
    fd.append('plate', plate);
    if (cnhPhoto) fd.append('cnhPhoto', cnhPhoto);
    if (platePhoto) fd.append('platePhoto', platePhoto);
    await api.post('/verification/motoboy', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setEditCourier(false);
  }, 'Dados enviados para análise.');

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

  const hasCpf = !!account.cpf;
  const hasRg = !!account.rg;
  const hasAnyDoc = hasCpf || hasRg;
  const selectedNumber = docType === 'cpf' ? account.cpf : account.rg;
  const maskedNumber = docType === 'cpf' ? maskCPF(selectedNumber) : maskRG(selectedNumber);

  const cs = ver?.courier.status || 'none';
  const fs = ver?.facial.status || 'none';
  const ds = doc.status || 'none';

  const shownMissing = onboarding
    ? (ver?.missing ?? []).filter((m) => m !== 'document')
    : (ver?.missing ?? []);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <OnboardingProgress />

        <div className={styles.header}>
          <h1 className={styles.title}>Verificação de motoboy</h1>
          {!onboarding && <a href="/motoboy" className={styles.laterLink}>Verificar depois →</a>}
        </div>
        <p className={`${styles.subtitle} ${ver?.verified ? styles.subtitleOk : ''}`}>
          {ver?.verified && <CheckCircle2 size={16} aria-hidden="true" />}
          {ver?.verified
            ? 'Você está verificado — já pode aceitar entregas.'
            : 'Conclua os passos abaixo para aceitar entregas.'}
        </p>
        {msg && <div className={styles.banner}>{msg}</div>}

        {/* Documento */}
        {!onboarding && (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Documento (CPF ou RG)</h2>
              <StatusBadge s={ds} />
            </div>
            {ds === 'pending' && (
              <p className={styles.hint}><Clock size={14} aria-hidden="true" /> Em análise pela nossa equipe.</p>
            )}
            {ds === 'rejected' && (
              <p className={styles.hintDanger}>Recusado: {doc.rejectionReason || 'reenvie com fotos legíveis.'}</p>
            )}
            {(ds === 'none' || ds === 'rejected') && (
              !hasAnyDoc ? (
                <p className={styles.hint}>
                  Cadastre seu CPF ou RG em <a href="/editar-conta" className={styles.link}>Editar meus dados</a> antes de enviar o documento.
                </p>
              ) : (
                <>
                  {hasCpf && hasRg && (
                    <div className={styles.chipRow}>
                      <Chip label="CPF" active={docType === 'cpf'} onClick={() => setDocType('cpf')} />
                      <Chip label="RG" active={docType === 'rg'} onClick={() => setDocType('rg')} />
                    </div>
                  )}
                  <label className={styles.fieldLabel}>Número (cadastrado em Editar meus dados)</label>
                  <div className={styles.numberField}>
                    <Input value={maskedNumber} onChange={() => {}} disabled aria-label="Número do documento" />
                  </div>

                  <div className={styles.uploadRow}>
                    <DropzoneField label="Frente" file={docFront} onChange={setDocFront} />
                    <DropzoneField label="Verso" file={docBack} onChange={setDocBack} />
                  </div>

                  <Button variant="primary" onClick={submitDoc} className={styles.submitBtn}>Enviar documento</Button>
                </>
              )
            )}
          </section>
        )}

        {/* Selfie facial */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Selfie (facial)</h2>
            <StatusBadge s={fs} />
          </div>
          {fs === 'pending' && (
            <p className={styles.hint}><Clock size={14} aria-hidden="true" /> Em análise pela nossa equipe.</p>
          )}
          {fs === 'rejected' && (
            <p className={styles.hintDanger}>Recusado: {ver?.facial.rejectionReason || 'reenvie com boa iluminação.'}</p>
          )}
          {(fs === 'none' || fs === 'rejected') && (
            <>
              <p className={styles.hint}>Tire uma selfie do seu rosto (para comparar com o documento).</p>
              <div className={styles.uploadSingle}>
                <DropzoneField label="Selfie" file={selfie} onChange={setSelfie} />
              </div>
              <Button variant="primary" onClick={sendFacial} className={styles.submitBtn}>Enviar selfie</Button>
            </>
          )}
        </section>

        {/* CNH / placa */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>CNH, placa e foto da placa</h2>
            <StatusBadge s={cs} />
          </div>
          {cs === 'rejected' && (
            <p className={styles.hintDanger}>Recusado: {ver?.courier.rejectionReason}</p>
          )}
          {cs === 'pending' && !editCourier && (
            <p className={styles.hint}><Clock size={14} aria-hidden="true" /> Em análise pela nossa equipe.</p>
          )}
          {cs === 'approved' && !editCourier && (
            <p className={styles.plateInfo}><CheckCircle2 size={14} aria-hidden="true" /> Aprovado. Placa: {ver?.courier?.plate}</p>
          )}
          {(cs === 'pending' || cs === 'approved') && !editCourier && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setCnh(ver?.courier?.cnhNumber || ''); setPlate(ver?.courier?.plate || ''); setEditCourier(true); }}
            >
              Trocar foto da placa / reenviar
            </Button>
          )}
          {(cs === 'none' || cs === 'rejected' || editCourier) && (
            <>
              <div className={styles.fieldGroup}>
                <Input
                  value={cnh}
                  onChange={(v) => setCnh(maskCNH(v))}
                  placeholder="Número de registro da CNH (11 dígitos)"
                  inputMode="numeric"
                  aria-label="Número da CNH"
                />
              </div>
              <div className={styles.fieldGroup}>
                <Input
                  value={plate}
                  onChange={(v) => setPlate(maskPlate(v))}
                  placeholder="Placa da moto (ABC1D23)"
                  aria-label="Placa da moto"
                />
              </div>
              <label className={styles.fieldLabel}>
                Foto da CNH {editCourier && '(opcional — mantém a atual se não enviar)'}
              </label>
              <div className={styles.uploadSingle}>
                <DropzoneField label="Foto da CNH" file={cnhPhoto} onChange={setCnhPhoto} />
              </div>
              <label className={styles.fieldLabel}>
                Foto da placa da moto {editCourier && '(opcional)'}
              </label>
              <div className={styles.uploadSingle}>
                <DropzoneField label="Foto da placa" file={platePhoto} onChange={setPlatePhoto} />
              </div>
              <Button variant="primary" onClick={sendCourier} className={styles.submitBtn}>Enviar para análise</Button>
            </>
          )}
        </section>

        <p className={styles.hint}>
          O <strong>e-mail</strong> é verificado na <a href="/verificacao" className={styles.link}>página da conta</a>. Todos os passos
          precisam estar aprovados para liberar as entregas.
        </p>
        {shownMissing.length > 0 && (
          <p className={styles.hint}>Ainda falta: {shownMissing.join(', ')}.</p>
        )}
      </div>
      <OnboardingFooter />
    </div>
  );
}

function StatusBadge({ s }: { s: St }) {
  const map: Record<St, { label: string; cls: string; icon?: JSX.Element }> = {
    approved: { label: 'Aprovado', cls: styles.badgeDone, icon: <CheckCircle2 size={12} aria-hidden="true" /> },
    pending: { label: 'Em análise', cls: styles.badgePending, icon: <Clock size={12} aria-hidden="true" /> },
    rejected: { label: 'Recusado', cls: styles.badgeRejected, icon: <XCircle size={12} aria-hidden="true" /> },
    none: { label: 'Pendente', cls: styles.badgeTodo },
  };
  const { label, cls, icon } = map[s];
  return (
    <span className={`${styles.badge} ${cls}`}>
      {icon}
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
        aria-label={`Foto — ${label.toLowerCase()}`}
      />
    </label>
  );
}
