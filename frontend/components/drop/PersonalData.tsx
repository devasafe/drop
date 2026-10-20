import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ChevronRight, Lock, Pencil } from 'lucide-react';
import api from '../../lib/api';
import { maskCpfMiddle } from '../../lib/maskCpf';
import { maskCPF, maskPhone, onlyDigits } from '../../lib/masks';
import { isValidCPF } from '../../lib/cpf';
import { ROUTES, authHref, contaHref } from '../../lib/routes';
import { Avatar } from '../ui/Avatar';
import { Sheet } from '../ui/Sheet';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Skeleton } from '../ui/Skeleton';
import { IMAGE_SPECS } from '../../lib/imageSpecs';
import { useImagePicker } from '../image/useImagePicker';
import styles from './PersonalData.module.css';

type Campo = 'name' | 'telefone' | 'cpf';
const ROTULO: Record<Campo, string> = { name: 'Nome', telefone: 'Celular', cpf: 'CPF' };

/** Mensagem do servidor (ex.: 400 "CPF inválido"), em string ou { message }. */
function serverMessage(e: any): string | null {
  const err = e?.response?.data?.error;
  if (typeof err === 'string') return err;
  if (err && typeof err.message === 'string') return err.message;
  return null;
}

/** Dados pessoais (protótipo): linhas, cada uma editável num sheet de um campo. */
export function PersonalData() {
  const router = useRouter();
  const [me, setMe] = useState<any | null>(null);
  const [failed, setFailed] = useState(false);
  const [edit, setEdit] = useState<Campo | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Recorte obrigatório 1:1: a foto sobe já em 400 × 400.
  const uploadPhoto = async (f: File) => {
    setPhotoError(null);
    const fd = new FormData();
    fd.append('photo', f);
    try {
      const r = await api.post('/user/me/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMe((m: any) => ({ ...m, photo: r.data?.photo ?? m.photo }));
    } catch (e) {
      setPhotoError(serverMessage(e) || 'Não deu para trocar a foto.');
    }
  };
  const picker = useImagePicker(IMAGE_SPECS.avatar, uploadPhoto, { onError: setPhotoError });

  const load = () => {
    setFailed(false);
    api.get('/user/me').then((r) => setMe(r.data)).catch(() => setFailed(true));
  };
  useEffect(load, []);

  if (failed) return <Alert tone="error" title="Não carregamos seus dados" action={{ label: 'Tentar de novo', onClick: load }} />;
  if (!me) return <div className={styles.wrap}><Skeleton height={72} /><Skeleton height={200} /></div>;

  const emailOk = me.verification?.email?.status === 'verified';
  const cpfOk = me.verification?.document?.status === 'approved';
  const since = me.createdAt ? new Date(me.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : null;
  const open = (c: Campo) => {
    setEdit(c);
    setError(null);
    setValue(c === 'telefone' ? maskPhone(me.telefone || '') : c === 'cpf' ? maskCPF(me.cpf || '') : me.name || '');
  };
  const save = async () => {
    if (!edit) return;
    const payload = edit === 'name' ? { name: value.trim() } : { [edit]: onlyDigits(value) };
    if (edit === 'cpf' && !isValidCPF(onlyDigits(value))) { setError('CPF inválido'); return; }
    setSaving(true);
    try {
      await api.patch('/user/me', payload);
      setMe((m: any) => ({ ...m, ...payload }));
      setEdit(null);
    } catch (e: any) {
      // O servidor já recusa CPF inválido (400): mostramos a mensagem dele.
      setError(serverMessage(e) || 'Não deu para salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  };
  const row = (label: string, text: string, opts: { campo?: Campo; badge?: string } = {}) => (
    <div className={styles.row}>
      <span className={styles.tx}><span>{label}</span><b>{text}</b></span>
      {opts.badge && <span className={styles.badge}>{opts.badge}</span>}
      {opts.campo && (
        <button type="button" className={styles.edit} aria-label={`Editar ${label === 'CPF' ? label : label.toLowerCase()}`} onClick={() => open(opts.campo!)}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.photoRow}>
        <Avatar name={me.name || 'Você'} src={me.photo} size="lg" />
        <div>
          <button type="button" className={styles.link} onClick={picker.open}>Trocar foto</button>
          <p className={styles.hint}>Opcional · o motoboy vê na entrega</p>
          <input {...picker.inputProps} hidden aria-label="Foto de perfil" />
        </div>
      </div>
      {photoError && <Alert tone="error" title={photoError} />}
      {picker.sheet}
      <div className={styles.card}>
        {row('Nome', me.name || '—', { campo: 'name' })}
        {row('E-mail', me.email, { badge: emailOk ? 'Confirmado' : undefined })}
        {row('Celular', me.telefone ? maskPhone(me.telefone) : 'Não informado', { campo: 'telefone' })}
        {row('CPF', (me.cpf && maskCpfMiddle(me.cpf)) || 'Não informado', cpfOk ? { badge: 'Verificado' } : { campo: 'cpf' })}
        {since && row('Membro desde', since)}
      </div>
      {cpfOk && <p className={styles.hint}>CPF verificado só muda pelo suporte.</p>}
      <div className={styles.card}>
        <button type="button" className={styles.nav} onClick={() => router.push(authHref(ROUTES.esqueciSenha, contaHref('dados')))}>
          <Lock size={20} aria-hidden="true" /><span>Trocar senha</span><ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={edit ? `Editar ${ROTULO[edit] === 'CPF' ? 'CPF' : ROTULO[edit].toLowerCase()}` : ''} presentation="bottom">
        {edit && (
          <div className={styles.sheet}>
            <Input
              id="pd-campo"
              label={ROTULO[edit]}
              value={value}
              error={error ?? undefined}
              inputMode={edit === 'name' ? undefined : 'numeric'}
              onChange={(v) => setValue(edit === 'telefone' ? maskPhone(v) : edit === 'cpf' ? maskCPF(v) : v)}
            />
            <Button onClick={save} loading={saving} disabled={!value.trim()}>Salvar</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
