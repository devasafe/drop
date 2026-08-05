import { useState, ChangeEvent } from 'react';
import { useRouter } from 'next/router';
import { Camera } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import OnboardingProgress from '../components/OnboardingProgress';
import { Button } from '../components/ui/Button';
import { getNextStep, getFinalDestination } from '../lib/onboardingFlow';
import styles from './FotoPerfil.module.css';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
// Assinaturas (magic bytes) dos formatos aceitos — mesma checagem usada no
// antigo formulário de cadastro, para não confiar só em MIME/extensão (que o
// usuário pode forjar).
const VALID_HEADERS = ['89504e47', 'ffd8ffe0', 'ffd8ffe1', 'ffd8ffe2', '47494638'];
const MAX_SIZE = 5 * 1024 * 1024;

/**
 * Passo de onboarding: foto de perfil. Obrigatório apenas para motoboy (é
 * como ele é reconhecido nas entregas) — por isso o "Pular por agora" só
 * aparece para os demais papéis, que podem trocar a foto depois em seu perfil.
 */
export default function FotoPerfilPage() {
  const router = useRouter();
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

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');

    if (!ALLOWED_MIMES.includes(file.type)) {
      setError('Apenas imagens (JPG, PNG, GIF, WebP) são aceitas.');
      return;
    }
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setError('Extensão de arquivo não permitida.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('O arquivo deve ter menos de 5MB.');
      return;
    }

    const headerReader = new FileReader();
    headerReader.onload = (event) => {
      const arr = new Uint8Array(event.target?.result as ArrayBuffer).subarray(0, 4);
      let header = '';
      for (let i = 0; i < arr.length; i++) header += arr[i].toString(16);
      const isValidImage = VALID_HEADERS.some((h) => header.toLowerCase().startsWith(h.toLowerCase()));
      if (!isValidImage) {
        setError('Arquivo não é uma imagem válida.');
        setPhoto(null);
        setPreview('');
        return;
      }
      setPhoto(file);
      const previewReader = new FileReader();
      previewReader.onload = (e) => setPreview(e.target?.result as string);
      previewReader.readAsDataURL(file);
    };
    headerReader.readAsArrayBuffer(file.slice(0, 12));
  };

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
            {photo ? photo.name : 'Toque para escolher uma foto'}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className={styles.hiddenInput}
            aria-label="Selecionar foto de perfil"
          />
        </label>

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
