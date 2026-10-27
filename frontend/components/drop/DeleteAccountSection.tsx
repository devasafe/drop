import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../lib/routes';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import styles from './DeleteAccountSection.module.css';

interface Blocker { code: string; message: string }

/**
 * "Excluir minha conta" dentro do app (Google Play, Apple 5.1.1(v), LGPD). Usada por
 * cliente, loja e motoboy. O backend diz o que impede (pedido, saldo, repasse) e exige a senha.
 */
export function DeleteAccountSection({ note }: { note?: string }) {
  const router = useRouter();
  const { logout } = useAuth() || ({} as any);
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/account/deletion-check')
      .then((r) => setBlockers(Array.isArray(r.data?.blockers) ? r.data.blockers : []))
      .catch(() => setBlockers([]));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/account/delete', { password });
      logout?.();
      router.replace(ROUTES.inicio);
    } catch (err: any) {
      const data = err?.response?.data;
      if (Array.isArray(data?.blockers)) setBlockers(data.blockers);
      setError(data?.message || 'Não conseguimos excluir agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.danger} aria-labelledby="excluir-conta">
      <h2 id="excluir-conta" className={styles.title}>Excluir minha conta</h2>
      <p className={styles.meta}>
        {note || 'Apagamos seus dados pessoais e você não entra mais com esta conta. Notas e pedidos ficam guardados 5 anos por lei, sem o seu nome.'}
      </p>
      {blockers === null ? null : blockers.length > 0 ? (
        <>
          {blockers.map((b) => <p key={b.code} className={styles.blocker}>{b.message}</p>)}
          <p className={styles.meta}>Resolva isso antes de excluir a conta.</p>
        </>
      ) : !open ? (
        <button type="button" className={styles.button} onClick={() => setOpen(true)}>Excluir minha conta</button>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <p className={styles.warn}>Não dá para desfazer. Digite sua senha para confirmar.</p>
          <Input
            type="password"
            label="Senha"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            error={error || undefined}
          />
          <div className={styles.actions}>
            <Button type="submit" variant="danger" loading={busy} disabled={!password}>Excluir de vez</Button>
            <Button type="button" variant="tertiary" onClick={() => { setOpen(false); setPassword(''); setError(null); }}>Cancelar</Button>
          </div>
        </form>
      )}
    </section>
  );
}
