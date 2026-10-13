import { useEffect, useState, ChangeEvent } from 'react';
import { CheckCircle2, Clock, XCircle, Upload, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { maskCNPJ } from '../lib/masks';
import OnboardingProgress from '../components/OnboardingProgress';
import OnboardingFooter from '../components/OnboardingFooter';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import styles from './VerificacaoLoja.module.css';
import ModeGate from '../components/ModeGate';

type St = 'none' | 'pending' | 'approved' | 'rejected';
interface StoreVer {
  isVerified: boolean;
  missing: string[];
  facial: { status: St; rejectionReason?: string };
  cnpj: { status: St; razaoSocial?: string; situacao?: string; rejectionReason?: string };
  address: { status: St; rejectionReason?: string };
}

function VerificacaoLojaPageInner() {
  const [storeId, setStoreId] = useState('');
  const [ver, setVer] = useState<StoreVer | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [selfie, setSelfie] = useState<File | null>(null);
  const [storeCnpj, setStoreCnpj] = useState('');
  const [comprovante, setComprovante] = useState<File | null>(null);

  const loadStatus = async (id: string) => {
    const { data } = await api.get(`/verification/store/${id}`);
    setVer(data);
  };

  const init = async () => {
    try {
      const { data } = await api.get('/stores/dashboard');
      const id = data?.store?._id || data?._id || data?.storeId || data?.store?.id;
      if (!id) { setErr('Não foi possível identificar sua loja.'); return; }
      setStoreId(id);
      setStoreCnpj(data?.store?.cnpj || '');
      await loadStatus(id);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Faça login como lojista para acessar.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { init(); }, []);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); if (storeId) await loadStatus(storeId); }
    catch (e: any) { setMsg(e?.response?.data?.error || 'Erro na operação.'); }
  };

  const sendFacial = () => run(async () => {
    if (!selfie) throw { response: { data: { error: 'Selecione a selfie.' } } };
    const fd = new FormData(); fd.append('selfie', selfie);
    await api.post('/verification/facial', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Foto enviada para análise.');

  const sendCnpj = () => run(() => api.post(`/verification/store/${storeId}/cnpj`, {}), 'CNPJ enviado para análise.');

  const sendAddress = () => run(async () => {
    if (!comprovante) throw { response: { data: { error: 'Selecione o comprovante.' } } };
    const fd = new FormData(); fd.append('comprovante', comprovante);
    await api.post(`/verification/store/${storeId}/address`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Comprovante enviado para análise.');

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

  const facialStatus = ver?.facial.status || 'none';
  const cnpjStatus = ver?.cnpj.status || 'none';
  const addressStatus = ver?.address.status || 'none';

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <OnboardingProgress />

        <div className={styles.header}>
          <h1 className={styles.title}>Verificação da loja</h1>
          <a href="/seller/abrir" className={styles.laterLink}>Voltar para Abrir a loja</a>
        </div>
        <p className={`${styles.subtitle} ${ver?.isVerified ? styles.subtitleOk : ''}`}>
          {ver?.isVerified && <CheckCircle2 size={16} aria-hidden="true" />}
          {ver?.isVerified
            ? 'Loja verificada — ela já aparece para os clientes.'
            : 'Conclua os itens abaixo para sua loja aparecer na lista e vender.'}
        </p>
        {msg && <div className={styles.banner}>{msg}</div>}

        {ver?.missing?.includes('owner') && (
          <section className={styles.ownerWarning}>
            <div className={styles.ownerWarningHead}>
              <AlertTriangle size={16} aria-hidden="true" />
              <strong className={styles.ownerWarningTitle}>Conta do dono pendente</strong>
            </div>
            <p className={styles.hint}>
              A loja só fica verificada depois que sua <strong>conta de usuário</strong> (email e documento) estiver verificada.
            </p>
            <a href="/verificacao" className={styles.link}>Verificar minha conta →</a>
          </section>
        )}

        {/* Facial */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Foto do rosto (dono)</h2>
            <StatusBadge s={facialStatus} />
          </div>
          {facialStatus === 'pending' && (
            <p className={styles.hint}><Clock size={14} aria-hidden="true" /> Em análise pela nossa equipe.</p>
          )}
          {facialStatus === 'rejected' && (
            <p className={styles.hintDanger}>Recusado: {ver?.facial.rejectionReason}</p>
          )}
          {(facialStatus === 'none' || facialStatus === 'rejected') && (
            <>
              <ul className={styles.tips}>
                <li>Lugar bem iluminado</li>
                <li>Sem boné, óculos escuros ou máscara</li>
                <li>Rosto inteiro na foto, olhando para a câmera</li>
              </ul>
              <div className={styles.uploadSingle}>
                <DropzoneField
                  label="Tirar foto do rosto"
                  file={selfie}
                  onChange={setSelfie}
                  capture="user"
                  inputLabel="Tirar ou escolher a foto do rosto"
                />
              </div>
              <Button variant="primary" onClick={sendFacial} className={styles.submitBtn} disabled={!selfie}>Enviar foto</Button>
              <p className={styles.hintSmall}>Usamos a foto só para confirmar que você é o dono do CNPJ.</p>
            </>
          )}
        </section>

        {/* CNPJ */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>CNPJ</h2>
            <StatusBadge s={cnpjStatus} />
          </div>
          {ver?.cnpj.razaoSocial && (
            <p className={styles.hint}>Razão social: {ver.cnpj.razaoSocial} · {ver.cnpj.situacao}</p>
          )}
          {cnpjStatus === 'pending' && (
            <p className={styles.hint}><Clock size={14} aria-hidden="true" /> Em análise pela nossa equipe.</p>
          )}
          {cnpjStatus === 'rejected' && (
            <p className={styles.hintDanger}>Recusado: {ver?.cnpj.rejectionReason}</p>
          )}
          {(cnpjStatus === 'none' || cnpjStatus === 'rejected') && (
            storeCnpj ? (
              <>
                <p className={styles.hint}>CNPJ cadastrado (em Editar meus dados):</p>
                <div className={styles.numberField}>
                  <Input value={maskCNPJ(storeCnpj)} onChange={() => {}} disabled aria-label="CNPJ da loja" />
                </div>
                <p className={styles.hintSmall}>
                  Para alterar, edite em <a href="/editar-conta" className={styles.link}>Editar meus dados</a>.
                </p>
                <Button variant="primary" onClick={sendCnpj} className={styles.submitBtn}>Enviar CNPJ para análise</Button>
              </>
            ) : (
              <p className={styles.hint}>
                Cadastre o CNPJ da loja em <a href="/editar-conta" className={styles.link}>Editar meus dados</a> antes de enviar para verificação.
              </p>
            )
          )}
        </section>

        {/* Endereço */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Endereço (comprovante)</h2>
            <StatusBadge s={addressStatus} />
          </div>
          {addressStatus === 'pending' && (
            <p className={styles.hint}><Clock size={14} aria-hidden="true" /> Em análise pela nossa equipe.</p>
          )}
          {addressStatus === 'rejected' && (
            <p className={styles.hintDanger}>Recusado: {ver?.address.rejectionReason}</p>
          )}
          {(addressStatus === 'none' || addressStatus === 'rejected') && (
            <>
              <p className={styles.hint}>Envie uma conta de luz/água/internet no nome ou endereço da loja.</p>
              <div className={styles.uploadSingle}>
                <DropzoneField label="Comprovante" file={comprovante} onChange={setComprovante} />
              </div>
              <Button variant="primary" onClick={sendAddress} className={styles.submitBtn}>Enviar comprovante</Button>
            </>
          )}
        </section>

        <p className={styles.hint}>Email, telefone e documento do dono são verificados na página da conta.</p>
      </div>
      <OnboardingFooter />
    </div>
  );
}

function StatusBadge({ s }: { s: St }) {
  const map: Record<St, { label: string; cls: string; icon?: JSX.Element }> = {
    approved: { label: 'Verificado', cls: styles.badgeDone, icon: <CheckCircle2 size={12} aria-hidden="true" /> },
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

function DropzoneField({ label, file, onChange, capture, inputLabel }: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  /** 'user' abre a câmera frontal no celular; no computador continua escolhendo arquivo. */
  capture?: 'user' | 'environment';
  inputLabel?: string;
}) {
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
        capture={capture}
        aria-label={inputLabel ?? `Foto — ${label.toLowerCase()}`}
      />
    </label>
  );
}

// Tela do modo custodia: fora dele abre o painel do papel em vez de bater 404 na API.
export default function VerificacaoLojaPage() {
  return (<ModeGate mode="custodia"><VerificacaoLojaPageInner /></ModeGate>);
}
