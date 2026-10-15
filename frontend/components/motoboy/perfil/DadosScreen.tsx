import { FormEvent, useState } from 'react';
import MotoboyShell from '../panel/MotoboyShell';
import blocks from '../../panel/PanelBlocks.module.css';
import MeusDadosForm from '../../MeusDadosForm';
import { PasswordField } from '../../drop/PasswordField';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import api from '../../../lib/api';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import styles from './Perfil.module.css';

/** "Dados e senha" do motoboy (protótipo 25, item do menu). As regras da troca de senha são as do profile.tsx antigo. */
export function DadosScreen() {
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!password || !newPassword || !confirm) { setMsg({ tone: 'error', text: 'Todos os campos são obrigatórios' }); return; }
    if (newPassword !== confirm) { setMsg({ tone: 'error', text: 'As senhas não conferem' }); return; }
    if (newPassword.length < 6) { setMsg({ tone: 'error', text: 'A nova senha deve ter no mínimo 6 caracteres' }); return; }
    setBusy(true);
    try {
      await api.put('/auth/profile', { password, newPassword });
      setMsg({ tone: 'success', text: 'Senha alterada.' });
      setPassword(''); setNewPassword(''); setConfirm('');
    } catch (err: any) {
      setMsg({ tone: 'error', text: err?.response?.data?.error || 'Não alteramos a senha agora. Tente de novo.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <MotoboyShell title="Dados e senha" back={MOTOBOY_ROUTES.perfil}>
      <div className={blocks.body}>
        <section aria-labelledby="dados-pessoais" className={blocks.stack}>
          <h2 id="dados-pessoais" className={blocks.cap}>Dados pessoais</h2>
          <div className={blocks.blk}><MeusDadosForm showStore={false} /></div>
        </section>
        <section aria-labelledby="dados-senha" className={blocks.stack}>
          <h2 id="dados-senha" className={blocks.cap}>Senha</h2>
          <form className={[blocks.blk, styles.form].join(' ')} onSubmit={submit} noValidate>
            <PasswordField id="senha-atual" label="Senha atual" value={password} onChange={setPassword} autoComplete="current-password" />
            <PasswordField id="senha-nova" label="Nova senha" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
            <PasswordField id="senha-confirma" label="Confirmar nova senha" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {msg && <Alert tone={msg.tone} title={msg.text} />}
            <Button type="submit" loading={busy}>Alterar senha</Button>
          </form>
        </section>
      </div>
    </MotoboyShell>
  );
}

export default DadosScreen;
