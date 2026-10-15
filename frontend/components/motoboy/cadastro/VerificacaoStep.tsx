// frontend/components/motoboy/cadastro/VerificacaoStep.tsx
import { useCallback, useEffect, useState } from 'react';
import { Bike, Camera, FileText, Mail } from 'lucide-react';
import blocks from '../../panel/PanelBlocks.module.css';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Input } from '../../ui/Input';
import { Skeleton } from '../../ui/Skeleton';
import api from '../../../lib/api';
import { cleanRG, maskCNH, maskCPF, maskPlate, maskRG, onlyDigits } from '../../../lib/masks';
import { kycItems, proximoItemAberto, type KycItem, type KycKey } from '../../../lib/motoboyCadastro';
import styles from './Cadastro.module.css';

const MAX_BYTES = 5 * 1024 * 1024; // mesmo limite do middleware de upload do backend
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };
const TAG: Record<KycItem['state'], [string, string]> = {
  done: ['Feito', blocks.tagOk],
  pending: ['Em análise', blocks.tagInfo],
  rejected: ['Refazer', blocks.tagErr],
  todo: ['Falta enviar', ''],
};
const ICON: Record<KycKey, typeof Mail> = { email: Mail, document: FileText, facial: Camera, courier: Bike };
const SUB: Record<KycKey, string> = {
  email: '',
  document: 'CPF ou RG · frente e verso',
  facial: 'Foto do seu rosto, com boa luz',
  courier: 'CNH e placa da moto · categoria A',
};

/** Erro de validação local (a mensagem vai direto para a tela). */
class Falta extends Error {}

interface Loaded { items: KycItem[]; email: string; cpf: string; rg: string; courierStatus: string }

function FileField({ id, label, hint, file, onPick, capture }: {
  id: string; label: string; hint: string; file: File | null; onPick: (f: File | null) => void; capture?: 'user' | 'environment';
}) {
  return (
    <div className={styles.upload}>
      <span className={blocks.tx}>
        <b>{label}</b>
        <span>{file ? `${file.name} · ${(file.size / 1048576).toFixed(1).replace('.', ',')} MB` : hint}</span>
      </span>
      <label className={blocks.fileBtn} htmlFor={id}>
        {file ? 'Trocar' : 'Tirar foto'}
        <input id={id} type="file" accept="image/*" capture={capture} className={blocks.hiddenInput} aria-label={label}
          onChange={(e) => onPick(e.target.files?.[0] || null)} />
      </label>
    </div>
  );
}

/** Etapa 2 do cadastro (protótipo 10). Porte da antiga página de verificação do motoboy: mesmas rotas de API, mesmos campos. */
export function VerificacaoStep({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<KycKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [docType, setDocType] = useState<'cpf' | 'rg'>('cpf');
  const [docNumber, setDocNumber] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [cnh, setCnh] = useState('');
  const [plate, setPlate] = useState('');
  const [cnhPhoto, setCnhPhoto] = useState<File | null>(null);
  const [platePhoto, setPlatePhoto] = useState<File | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([api.get('/verification/me'), api.get('/verification/motoboy/me'), api.get('/user/me')])
      .then(([v, m, u]) => {
        const items = kycItems(v.data, m.data);
        const cpf = String(u.data?.cpf || '');
        const rg = String(u.data?.rg || '');
        const courier = m.data?.courier || {};
        setData({ items, email: String(u.data?.email || ''), cpf, rg, courierStatus: String(courier.status || 'none') });
        setDocType(cpf ? 'cpf' : rg ? 'rg' : 'cpf');
        if (courier.cnhNumber) setCnh(maskCNH(String(courier.cnhNumber)));
        if (courier.plate) setPlate(maskPlate(String(courier.plate)));
        setOpen((cur) => cur ?? proximoItemAberto(items));
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = (setter: (f: File | null) => void) => (f: File | null) => {
    if (f && f.size > MAX_BYTES) { setMsg({ tone: 'error', text: 'Foto muito grande. Tire de novo com menos de 5 MB.' }); return; }
    setMsg(null);
    setter(f);
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'success', text: ok });
      setOpen(null); // a próxima pendência abre sozinha na releitura
      // Envio aceito: as fotos já foram. Se o item for recusado de novo, pede foto nova (nunca reenvia a antiga).
      setFront(null);
      setBack(null);
      setSelfie(null);
      setCnhPhoto(null);
      setPlatePhoto(null);
      load();
      onChanged();
    } catch (e: any) {
      setMsg({ tone: 'error', text: e instanceof Falta ? e.message : e?.response?.data?.error || 'Não deu certo agora. Tente de novo.' });
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try { await api.post('/verification/email/resend'); setCodeSent(true); }
    catch (e: any) { setMsg({ tone: 'error', text: e?.response?.data?.error || 'Não mandamos o código agora. Tente de novo.' }); }
    finally { setBusy(false); }
  };
  const confirmEmail = () => act(() => api.post('/verification/email/verify', { code }), 'E-mail confirmado.');

  const submitDoc = () => act(async () => {
    if (!data) return;
    if (!front || !back) throw new Falta('Envie a frente e o verso do documento.');
    const has = docType === 'cpf' ? !!data.cpf : !!data.rg;
    if (!has) {
      const digits = docType === 'cpf' ? onlyDigits(docNumber) : cleanRG(docNumber);
      if (!digits) throw new Falta(`Informe o número do ${docType.toUpperCase()}.`);
      await api.patch('/user/me', { [docType]: digits });
    }
    const fd = new FormData();
    fd.append('type', docType);
    fd.append('front', front);
    fd.append('back', back);
    await api.post('/verification/document', fd, MULTIPART);
  }, 'Documento enviado para análise.');

  const sendSelfie = () => act(async () => {
    if (!selfie) throw new Falta('Tire a selfie primeiro.');
    const fd = new FormData();
    fd.append('selfie', selfie);
    await api.post('/verification/facial', fd, MULTIPART);
  }, 'Selfie enviada para análise.');

  const isFirstCourier = (data?.courierStatus || 'none') === 'none';
  const courierMissing = !onlyDigits(cnh)
    ? 'Falta o número da CNH'
    : !plate ? 'Falta a placa'
      : isFirstCourier && !cnhPhoto ? 'Falta a foto da CNH'
        : isFirstCourier && !platePhoto ? 'Falta a foto da placa' : null;

  const sendCourier = () => act(async () => {
    if (courierMissing) throw new Falta(courierMissing);
    const fd = new FormData();
    fd.append('cnhNumber', cnh);
    fd.append('plate', plate);
    if (cnhPhoto) fd.append('cnhPhoto', cnhPhoto);
    if (platePhoto) fd.append('platePhoto', platePhoto);
    await api.post('/verification/motoboy', fd, MULTIPART);
  }, 'CNH e placa enviadas para análise.');

  if (failed) return <Alert tone="error" title="Não carregamos sua verificação" action={{ label: 'Tentar de novo', onClick: load }} />;
  if (!data) return <><Skeleton height={200} radius="var(--radius-lg)" /><Skeleton height={160} radius="var(--radius-lg)" /></>;

  const hasNumber = docType === 'cpf' ? !!data.cpf : !!data.rg;
  const maskedNumber = docType === 'cpf' ? maskCPF(data.cpf) : maskRG(data.rg);

  return (
    <div className={blocks.stack}>
      <p className={blocks.sub}>Sem isso você não recebe corridas. Leva uns 5 minutos e a análise sai em até 1 dia útil.</p>
      <ul className={blocks.list}>
        {data.items.map((it) => {
          const Icon = ICON[it.key];
          const [tag, tagCls] = TAG[it.state];
          const canOpen = it.state === 'todo' || it.state === 'rejected' || it.key === 'courier';
          const sub = it.key === 'email' ? data.email : it.state === 'rejected' ? `Recusada: ${it.reason || 'envie de novo'}` : SUB[it.key];
          const icoCls = it.state === 'done' ? blocks.icoOk : it.state === 'rejected' ? blocks.icoErr : open === it.key ? blocks.icoBrand : '';
          const inner = (
            <>
              <span className={[blocks.ico, icoCls].filter(Boolean).join(' ')} aria-hidden="true"><Icon size={18} /></span>
              <span className={blocks.tx}>
                <b>{it.label}</b>
                <span className={it.state === 'rejected' ? blocks.err : undefined}>{sub}</span>
              </span>
              <span className={[blocks.tag, tagCls].filter(Boolean).join(' ')}>{tag}</span>
            </>
          );
          return (
            <li key={it.key}>
              {canOpen ? (
                <button type="button" aria-expanded={open === it.key}
                  className={[blocks.row, blocks.rowButton, open === it.key && blocks.rowCurrent].filter(Boolean).join(' ')}
                  onClick={() => { setMsg(null); setOpen(open === it.key ? null : it.key); }}>
                  {inner}
                </button>
              ) : <div className={blocks.row}>{inner}</div>}
            </li>
          );
        })}
      </ul>

      {msg && <Alert tone={msg.tone} title={msg.text} />}

      {open === 'email' && (
        <section className={blocks.blk} aria-label="Confirmar e-mail">
          <h3 className={blocks.headTitle}>Confirme seu e-mail</h3>
          <p className={blocks.sub}>{`Mandamos um código de 6 dígitos para ${data.email}.`}</p>
          {codeSent ? (
            <>
              <Input id="mb-codigo" label="Código" value={code} onChange={(v) => setCode(onlyDigits(v).slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
              <Button onClick={confirmEmail} loading={busy} disabled={code.length !== 6}>Confirmar e-mail</Button>
              <button type="button" className={blocks.link} onClick={sendCode} disabled={busy}>Mandar outro código</button>
            </>
          ) : (
            <Button onClick={sendCode} loading={busy}>Enviar código</Button>
          )}
        </section>
      )}

      {open === 'document' && (
        <section className={blocks.blk} aria-label="Enviar documento">
          <h3 className={blocks.headTitle}>Documento</h3>
          <div className={blocks.chips} role="group" aria-label="Tipo de documento">
            <Chip label="CPF" active={docType === 'cpf'} onClick={() => setDocType('cpf')} />
            <Chip label="RG" active={docType === 'rg'} onClick={() => setDocType('rg')} />
          </div>
          {hasNumber ? (
            <Input id="mb-doc" label={`Número do ${docType.toUpperCase()}`} value={maskedNumber} onChange={() => undefined} disabled />
          ) : (
            <Input id="mb-doc" label={`Número do ${docType.toUpperCase()}`} value={docNumber}
              onChange={(v) => setDocNumber(docType === 'cpf' ? maskCPF(v) : maskRG(v))}
              inputMode={docType === 'cpf' ? 'numeric' : 'text'} maxLength={docType === 'cpf' ? 14 : 12} />
          )}
          <FileField id="mb-doc-frente" label="Frente do documento" hint="Foto nítida, sem reflexo" file={front} onPick={pick(setFront)} capture="environment" />
          <FileField id="mb-doc-verso" label="Verso do documento" hint="Foto nítida, sem reflexo" file={back} onPick={pick(setBack)} capture="environment" />
          <Button onClick={submitDoc} loading={busy} disabled={!front || !back}>Enviar documento</Button>
        </section>
      )}

      {open === 'facial' && (
        <section className={blocks.blk} aria-label="Enviar selfie">
          <h3 className={blocks.headTitle}>Selfie</h3>
          <p className={blocks.sub}>Rosto inteiro, sem óculos escuros e com luz de frente. A equipe compara com o documento.</p>
          <FileField id="mb-selfie" label="Selfie" hint="Use a câmera da frente" file={selfie} onPick={pick(setSelfie)} capture="user" />
          <Button onClick={sendSelfie} loading={busy} disabled={!selfie}>Enviar selfie</Button>
        </section>
      )}

      {open === 'courier' && (
        <section className={blocks.blk} aria-label="Enviar CNH e placa">
          <div className={blocks.head}>
            <h3 className={blocks.headTitle}>CNH e placa da moto</h3>
            <span className={blocks.meta}>categoria A</span>
          </div>
          <Input id="mb-cnh" label="Número de registro da CNH" value={cnh} onChange={(v) => setCnh(maskCNH(v))} inputMode="numeric" hint="11 dígitos, no verso da CNH." />
          <Input id="mb-placa" label="Placa da moto" value={plate} onChange={(v) => setPlate(maskPlate(v))} />
          {!isFirstCourier && <p className={blocks.meta}>No reenvio, as fotos são opcionais: mantemos a atual se você não trocar.</p>}
          <FileField id="mb-cnh-foto" label="Foto da CNH" hint="Aberta, com os dados legíveis" file={cnhPhoto} onPick={pick(setCnhPhoto)} capture="environment" />
          <FileField id="mb-placa-foto" label="Foto da placa" hint="Moto inteira, placa legível" file={platePhoto} onPick={pick(setPlatePhoto)} capture="environment" />
          <div className={blocks.bar}>
            <Button onClick={sendCourier} loading={busy} disabled={!!courierMissing}>Enviar CNH e placa</Button>
            {courierMissing && <small>{courierMissing}</small>}
          </div>
        </section>
      )}
    </div>
  );
}

export default VerificacaoStep;
