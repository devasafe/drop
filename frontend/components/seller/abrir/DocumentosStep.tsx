// Etapa "Documentos" (verificação da loja) do cadastro, como o bloco embutido do protótipo 8:
// CNPJ com a razão social, foto do rosto e comprovante de endereço. Embutida em /seller/abrir e
// reaproveitada por /verificacao-loja. Chamadas portadas da tela antiga, sem mudança:
// GET /verification/store/:id, POST /verification/facial (selfie), POST …/cnpj e POST …/address (comprovante).
import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { Camera, Check, Clock, FileText, Hash, TriangleAlert } from 'lucide-react';
import api from '../../../lib/api';
import { maskCNPJ } from '../../../lib/masks';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Skeleton } from '../../ui/Skeleton';
import blocks from '../ui/SellerBlocks.module.css';
import styles from './Etapas.module.css';

type St = 'none' | 'pending' | 'approved' | 'rejected';
export interface StoreVer {
  isVerified: boolean;
  missing?: string[];
  facial: { status: St; rejectionReason?: string };
  cnpj: { status: St; razaoSocial?: string; situacao?: string; rejectionReason?: string };
  address: { status: St; rejectionReason?: string };
}

interface Props {
  storeId: string;
  storeCnpj?: string | null;
  /** Depois de cada envio (o checklist relê as etapas). */
  onChanged?: () => void;
  /** Leva para Dados da loja (onde o CNPJ é cadastrado). */
  onEditStore: () => void;
  /** Leva para a identidade do dono, quando ela falta. */
  onOwner?: () => void;
}

const DOC_CLASS: Record<St, string> = { none: '', pending: styles.docWait, approved: styles.docOk, rejected: styles.docErr };

function statusText(s: St, reason: string | undefined, none: string, ok: string) {
  if (s === 'approved') return ok;
  if (s === 'pending') return 'Em análise';
  if (s === 'rejected') return `Recusado: ${reason || 'veja o que corrigir e envie de novo'}`;
  return none;
}

function DocIcon({ s, children }: { s: St; children: JSX.Element }) {
  const cls = s === 'approved' ? blocks.icoOk : s === 'pending' ? blocks.icoInfo : s === 'rejected' ? blocks.icoErr : blocks.icoBrand;
  const icon = s === 'approved' ? <Check size={18} /> : s === 'pending' ? <Clock size={18} /> : s === 'rejected' ? <TriangleAlert size={18} /> : children;
  return <span className={[blocks.ico, cls].join(' ')} aria-hidden="true">{icon}</span>;
}

function Pick({ label, file, onChange, capture }: { label: string; file: File | null; onChange: (f: File | null) => void; capture?: 'user' | 'environment' }) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.files?.[0] || null);
  return (
    <label className={styles.pick}>
      {file ? 'Trocar' : 'Escolher'}
      <input type="file" accept="image/*" capture={capture} className={styles.file} aria-label={label} onChange={handle} />
    </label>
  );
}

export function DocumentosStep({ storeId, storeCnpj, onChanged, onEditStore, onOwner }: Props) {
  const [ver, setVer] = useState<StoreVer | null>(null);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [comprovante, setComprovante] = useState<File | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    return api.get(`/verification/store/${storeId}`).then((r) => setVer(r.data)).catch(() => setFailed(true));
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setMsg(null);
    setBusy(key);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await load();
      onChanged?.();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.error || 'Erro na operação.' });
    } finally {
      setBusy(null);
    }
  };

  const sendFacial = () => run('facial', async () => {
    if (!selfie) throw { response: { data: { error: 'Selecione a selfie.' } } };
    const fd = new FormData(); fd.append('selfie', selfie);
    await api.post('/verification/facial', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setSelfie(null);
  }, 'Foto enviada para análise.');

  const sendCnpj = () => run('cnpj', () => api.post(`/verification/store/${storeId}/cnpj`, {}), 'CNPJ enviado para análise.');

  const sendAddress = () => run('address', async () => {
    if (!comprovante) throw { response: { data: { error: 'Selecione o comprovante.' } } };
    const fd = new FormData(); fd.append('comprovante', comprovante);
    await api.post(`/verification/store/${storeId}/address`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setComprovante(null);
  }, 'Comprovante enviado para análise.');

  if (failed) {
    return <Alert tone="error" title="Não carregamos seus documentos" action={{ label: 'Tentar de novo', onClick: () => { load(); } }} />;
  }
  if (!ver) return <Skeleton height={240} radius="var(--radius-lg)" />;

  const facial = ver.facial?.status || 'none';
  const cnpj = ver.cnpj?.status || 'none';
  const address = ver.address?.status || 'none';
  const canSend = (s: St) => s === 'none' || s === 'rejected';

  return (
    <section className={blocks.blk} aria-label="Documentos">
      <h3 className={blocks.headTitle}>Documentos</h3>
      {ver.isVerified && <Alert tone="success">Loja verificada. Ela já aparece para os clientes.</Alert>}
      {ver.missing?.includes('owner') && (
        <Alert tone="warning" title="Falta a identidade do dono" action={onOwner ? { label: 'Confirmar minha identidade', onClick: onOwner } : undefined}>
          A loja só é aprovada depois que o seu e-mail e o seu documento estiverem conferidos.
        </Alert>
      )}
      {msg && <Alert tone={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}

      {/* CNPJ */}
      <div className={styles.form}>
        {storeCnpj ? (
          <>
            <Input label="CNPJ" value={maskCNPJ(storeCnpj)} onChange={() => {}} disabled aria-label="CNPJ da loja" />
            {ver.cnpj?.razaoSocial && (
              <p className={styles.found}><Check size={16} aria-hidden="true" /><span>{`Encontrado: ${ver.cnpj.razaoSocial}`}</span></p>
            )}
            {cnpj !== 'none' && (
              <p className={cnpj === 'rejected' ? blocks.errText : blocks.meta}>{statusText(cnpj, ver.cnpj?.rejectionReason, '', 'CNPJ aprovado')}</p>
            )}
            {canSend(cnpj) && (
              <Button variant="secondary" loading={busy === 'cnpj'} onClick={sendCnpj}>Enviar CNPJ para análise</Button>
            )}
            {canSend(cnpj) && <button type="button" className={blocks.link} onClick={onEditStore}>Corrigir o CNPJ em Dados da loja</button>}
          </>
        ) : (
          <div className={styles.doc}>
            <DocIcon s="none"><Hash size={18} /></DocIcon>
            <span className={styles.docBody}><b>CNPJ</b><span>Cadastre o CNPJ da loja para enviar.</span></span>
            <button type="button" className={blocks.link} onClick={onEditStore}>Pôr o CNPJ em Dados da loja</button>
          </div>
        )}
      </div>

      {/* Foto do rosto */}
      <div className={[styles.doc, DOC_CLASS[facial]].join(' ')}>
        <DocIcon s={facial}><Camera size={18} /></DocIcon>
        <span className={styles.docBody}>
          <b>Foto do seu rosto</b>
          <span>{selfie ? selfie.name : statusText(facial, ver.facial?.rejectionReason, 'Tire agora com a câmera da frente', 'Aprovada')}</span>
        </span>
        {canSend(facial) && <Pick label="Tirar ou escolher a foto do rosto" file={selfie} onChange={setSelfie} capture="user" />}
      </div>
      {canSend(facial) && (
        <>
          <ul className={styles.tips}>
            <li>Lugar bem iluminado</li>
            <li>Sem boné, óculos escuros ou máscara</li>
            <li>Rosto inteiro na foto, olhando para a câmera</li>
          </ul>
          <Button variant="secondary" onClick={sendFacial} loading={busy === 'facial'} disabled={!selfie}>Enviar foto</Button>
          <p className={blocks.meta}>Usamos a foto só para confirmar que você é o dono do CNPJ.</p>
        </>
      )}

      {/* Comprovante de endereço */}
      <div className={[styles.doc, DOC_CLASS[address]].join(' ')}>
        <DocIcon s={address}><FileText size={18} /></DocIcon>
        <span className={styles.docBody}>
          <b>Comprovante de endereço</b>
          <span>{comprovante ? comprovante.name : statusText(address, ver.address?.rejectionReason, 'Conta de luz, água ou internet, até 90 dias', 'Aprovado')}</span>
        </span>
        {canSend(address) && <Pick label="Escolher o comprovante de endereço" file={comprovante} onChange={setComprovante} />}
      </div>
      {canSend(address) && (
        <Button variant="secondary" onClick={sendAddress} loading={busy === 'address'}>Enviar comprovante</Button>
      )}
    </section>
  );
}

export default DocumentosStep;
