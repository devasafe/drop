import { useState } from 'react';
import { useRouter } from 'next/router';
import { Camera } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { useClienteRedirect } from '../hooks/useClienteRedirect';
import { contaHref } from '../lib/routes';
import OnboardingProgress from '../components/OnboardingProgress';
import { Button } from '../components/ui/Button';
import { getNextStep, getFinalDestination } from '../lib/onboardingFlow';
import { IMAGE_SPECS } from '../lib/imageSpecs';
import { useImagePicker } from '../components/image/useImagePicker';
import styles from './FotoPerfil.module.css';

/**
 * Passo de onboarding: foto de perfil. Obrigatório apenas para motoboy (é
 * como ele é reconhecido nas entregas) — por isso o "Pular por agora" só
 * aparece para os demais papéis, que podem trocar a foto depois em seu perfil.
 */
export default function FotoPerfilPage() {
  const router = useRouter();
  useClienteRedirect(contaHref('dados'));
  const auth = useAuth();
  const { user, loading: authLoading } = auth;
  const role = user?.activeRole || user?.role;
  const onboarding = router.query.onboarding === '1';

  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const goNext = () => {
    const nextStep = getNextStep(role, '/foto-perfil');
    const nextPath = nextStep?.path || getFinalDestination(role);
    // Preserva o parâmetro de onboarding ao avançar para o próximo passo (mesma
    // convenção usada por OnboardingFooter), para o progresso continuar visível.
    router.push(onboarding && nextStep ? `${nextPath}?onboarding=1` : nextPath);
  };

  // Recorte obrigatório 1:1: a foto sai em 400 × 400 (JPEG do canvas, então o tipo já é confiável).
  const picker = useImagePicker(IMAGE_SPECS.avatar, (file, dataUrl) => {
    setPhoto(file);
    setPreview(dataUrl);
  }, { onError: setError });

  const handleSave = async () => {
    if (!photo) {
      setError('Selecione uma foto para continuar.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('photo', photo);
      const res = await api.post('/user/me/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      auth.setUser((u) => (u ? { ...u, photo: res.data.photo } : u));
      goNext();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao enviar a foto. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.subtitle}>Carregando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <OnboardingProgress />
        <h1 className={styles.title}>Sua foto de perfil</h1>
        <p className={styles.subtitle}>
          Clientes e lojistas usam essa foto para te reconhecer nas entregas.
        </p>

        {error && <div className={styles.notice}>{error}</div>}

        <label className={styles.dropzone}>
          <span className={styles.avatarPreview}>
            {preview ? (
              <img src={preview} alt="Pré-visualização da foto de perfil" className={styles.avatarImg} />
            ) : (
              <Camera size={28} className={styles.avatarIcon} aria-hidden="true" />
            )}
          </span>
          <span className={styles.dropzoneText}>
            {photo ? 'Toque para trocar a foto' : 'Toque para escolher uma foto'}
          </span>
          <input
            {...picker.inputProps}
            className={styles.hiddenInput}
            aria-label="Selecionar foto de perfil"
          />
        </label>
        {picker.sheet}

        <Button variant="primary" loading={saving} onClick={handleSave} className={styles.saveBtn}>
          Salvar e continuar
        </Button>

        {role !== 'motoboy' && (
          <button type="button" className={styles.skipLink} onClick={goNext}>
            Pular por agora
          </button>
        )}
      </div>
    </div>
  );
}
