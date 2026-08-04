import { useEffect, useState } from 'react';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import MotoboyRatingsBlock from '../../components/MotoboyRatingsBlock';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import MeusDadosForm from '../../components/MeusDadosForm';
import VerificationHub from '../../components/VerificationHub';
import styles from './MotoboyProfile.module.css';

export default function MotoboyProfile() {
  useRequireAuth(['motoboy']);
  const { showToast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user');
    setUser(u ? JSON.parse(u) : null);
    setLoading(false);
  }, []);

  const handleSave = async (e: any) => {
    e.preventDefault();
    if (!password || !newPassword || !confirmPassword) { showToast('Todos os campos são obrigatórios', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('As senhas não conferem', 'error'); return; }
    if (newPassword.length < 6) { showToast('A nova senha deve ter no mínimo 6 caracteres', 'error'); return; }
    setChanging(true);
    try {
      await api.put('/auth/profile', { password, newPassword });
      showToast('Senha alterada com sucesso!', 'success');
      setPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Erro ao alterar senha', 'error');
    } finally {
      setChanging(false);
    }
  };

  if (loading) {
    return <div className={styles.page}><div className={styles.container}><Skeleton height={80} radius="var(--r-lg)" /><Skeleton height={160} radius="var(--r-lg)" /></div></div>;
  }
  if (!user) {
    return <div className={styles.page}><div className={styles.container}><p className={styles.notFound}>Dados do usuário não encontrados.</p></div></div>;
  }

  const initials = user.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : 'MP';

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Perfil do motoboy</h1>

          <div className={styles.profileHead}>
            <div className={styles.avatar}>{initials}</div>
            <div className={styles.identity}>
              <div className={styles.name}>{user.name}</div>
              <div className={styles.email}>{user.email}</div>
            </div>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Suas avaliações</h2>
            <MotoboyRatingsBlock motoboyId={user.id || user._id} />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Verificações e recebimento</h2>
            <VerificationHub />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Meus dados</h2>
            <MeusDadosForm />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Alterar senha</h2>
            <form onSubmit={handleSave} className={styles.form}>
              <Input type="password" placeholder="Senha atual" value={password} onChange={(v) => setPassword(String(v))} />
              <Input type="password" placeholder="Nova senha" value={newPassword} onChange={(v) => setNewPassword(String(v))} />
              <Input type="password" placeholder="Confirmar nova senha" value={confirmPassword} onChange={(v) => setConfirmPassword(String(v))} />
              <Button type="submit" disabled={changing}>{changing ? 'Processando…' : 'Alterar senha'}</Button>
            </form>
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
