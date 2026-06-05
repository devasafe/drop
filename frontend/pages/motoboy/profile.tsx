import { useEffect, useState } from 'react';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import MotoboyRatingsBlock from '../../components/MotoboyRatingsBlock';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './MotoboyProfile.module.css';

export default function MotoboyProfile() {
  useRequireAuth(['motoboy']);
  const [user, setUser] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user');
    setUser(u ? JSON.parse(u) : null);
    setLoading(false);
  }, []);

  const handleSave = async (e: any) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    if (!password || !newPassword || !confirmPassword) {
      setMsg({ type: 'error', text: 'Todos os campos são obrigatórios' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'As senhas não conferem' });
      return;
    }

    if (newPassword.length < 6) {
      setMsg({ type: 'error', text: 'A nova senha deve ter no mínimo 6 caracteres' });
      return;
    }

    setChanging(true);
    try {
      await api.put('/auth/profile', { password, newPassword });
      setMsg({ type: 'success', text: 'Senha alterada com sucesso!' });
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMsg({ type: 'error', text: (err?.response?.data?.error || 'Erro ao alterar senha') });
    } finally {
      setChanging(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="form" />
      </div>
    );
  }

  if (!user) return <div className={styles.notFound}>Dados do usuário não encontrados.</div>;

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'MP';

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        {/* Header */}
        <div className={`${styles.container} ${styles.header}`}>
          <h1 className={styles.pageTitle}><Icon name="user" size={20} /> Meu Perfil</h1>
          <p className={styles.pageSubtitle}>Gerencie suas informações e segurança</p>
        </div>

        <div className={styles.container}>
          {/* Mensagem de Erro/Sucesso */}
          {msg.text && (
            <div className={msg.type === 'success' ? styles.alertSuccess : styles.alertError}>
              {msg.text}
            </div>
          )}

          <div className={styles.cardsGrid}>
            {/* Card de Informações do Perfil */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}><Icon name="clipboard" size={18} /> Informações Pessoais</h2>

              {/* Avatar */}
              <div className={styles.avatarWrap}>
                <div className={styles.avatar}>
                  {initials}
                </div>
              </div>

              {/* Info Fields */}
              <div className={styles.infoField}>
                <label className={styles.infoLabel}>Nome</label>
                <div className={styles.infoValue}>{user.name}</div>
              </div>

              <div className={styles.infoField}>
                <label className={styles.infoLabel}>Email</label>
                <div className={styles.infoValue}>{user.email}</div>
              </div>

              {user.phone && (
                <div className={styles.infoField}>
                  <label className={styles.infoLabel}>Telefone</label>
                  <div className={styles.infoValue}>{user.phone}</div>
                </div>
              )}
            </div>

            {/* Formulário de Alteração de Senha */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}><Icon name="lock" size={18} /> Alterar Senha</h2>

              <form onSubmit={handleSave}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Senha Atual</label>
                  <input
                    type="password"
                    placeholder="Digite sua senha atual"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Nova Senha</label>
                  <input
                    type="password"
                    placeholder="Digite sua nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Confirmar Senha</label>
                  <input
                    type="password"
                    placeholder="Confirme sua nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={styles.formInput}
                  />
                </div>

                <button
                  type="submit"
                  disabled={changing}
                  className={styles.btnPrimary}
                >
                  {changing ? 'Processando...' : 'Alterar Senha'}
                </button>

                <div className={styles.passwordTip}>
                  <b>Dica:</b> Use uma senha com pelo menos 6 caracteres, misturando letras e números.
                </div>
              </form>
            </div>
          </div>

          {/* Ratings Block */}
          <div className={styles.ratingsBlock}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}><Icon name="star" /> Suas Avaliações</h2>
              <MotoboyRatingsBlock motoboyId={user.id || user._id} />
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
