import { useState } from 'react';
import { useRouter } from 'next/router';
import { maskCPF, maskPhone, maskRG, onlyDigits, cleanRG } from '../lib/masks';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import styles from './Register.module.css';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [role, setRole] = useState('cliente');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const auth = useAuth();

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.type)) {
      setError('Apenas imagens (JPG, PNG, GIF, WebP) são aceitas');
      return;
    }

    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setError('Extensão de arquivo não permitida');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Arquivo deve ter menos de 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const arr = new Uint8Array(event.target?.result as ArrayBuffer).subarray(0, 4);
      let header = '';
      for (let i = 0; i < arr.length; i++) {
        header += arr[i].toString(16);
      }
      const validHeaders = ['89504e47', 'ffd8ffe0', 'ffd8ffe1', 'ffd8ffe2', '47494638'];
      const isValidImage = validHeaders.some(h => header.toLowerCase().startsWith(h.toLowerCase()));
      if (!isValidImage) {
        setError('Arquivo não é uma imagem válida');
        setPhoto(null);
        setPhotoPreview('');
        return;
      }
      setError('');
      setPhoto(file);
      const dataReader = new FileReader();
      dataReader.onload = (e) => { setPhotoPreview(e.target?.result as string); };
      dataReader.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file.slice(0, 12));
  };

  const submit = async (e: any) => {
    e.preventDefault();
    setError('');
    if ((role === 'motoboy' || role === 'lojista') && !photo) {
      setError(`Foto é obrigatória para ${role === 'motoboy' ? 'Motoboys' : 'Lojistas'}`);
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('password', password);
      formData.append('role', role);
      formData.append('telefone', onlyDigits(telefone));
      formData.append('cpf', onlyDigits(cpf));
      formData.append('rg', cleanRG(rg));
      formData.append('dataNascimento', dataNascimento);
      formData.append('sexo', sexo);
      if (photo) formData.append('photo', photo);
      await api.post('/auth/register', formData);
      await auth.login(email, password);
      router.push(role === 'lojista' ? '/seller/create-store' : '/');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Falha no cadastro. Verifique seus dados.');
      setLoading(false);
    }
  };

  const roleOptions = [
    { value: 'cliente', label: 'Cliente', desc: 'Compre produtos' },
    { value: 'lojista', label: 'Lojista', desc: 'Venda produtos' },
    { value: 'motoboy', label: 'Motoboy', desc: 'Faça entregas' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <div className={styles.card}>

        <div className={styles.logoWrapper}>
          <div className={styles.logoimg}>
            <img src="/images/logog_png.png" alt="DROP" />
          </div>
          <p className={styles.logoSubtitle}>Crie sua conta para começar</p>
        </div>

        <form onSubmit={submit} className={styles.form}>
          {error && <div className={styles.errorBox}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Tipo de Conta</label>
            <div className={styles.roleGrid}>
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`${styles.roleBtn} ${role === opt.value ? styles.roleBtnActive : ''}`}
                >
                  <div className={`${styles.roleBtnLabel} ${role === opt.value ? styles.roleBtnLabelActive : ''}`}>
                    {opt.label}
                  </div>
                  <div className={`${styles.roleBtnDesc} ${role === opt.value ? styles.roleBtnDescActive : ''}`}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Nome Completo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Seu nome" className={styles.input} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu@email.com" className={styles.input} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className={styles.input} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Telefone</label>
            <input type="tel" value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" className={styles.input} />
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.label}>CPF</label>
              <input type="text" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" className={styles.input} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>RG</label>
              <input type="text" value={rg} onChange={(e) => setRg(maskRG(e.target.value))} placeholder="00.000.000-0" className={styles.input} />
            </div>
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Nascimento</label>
              <input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} className={`${styles.input} ${styles.inputDark}`} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Gênero</label>
              <select value={sexo} onChange={(e) => setSexo(e.target.value)} className={`${styles.input} ${styles.inputDark}`}>
                <option value="">Selecione</option>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          {(role === 'motoboy' || role === 'lojista') && (
            <div className={styles.field}>
              <label className={styles.label}>
                Foto <span className={styles.labelRequired}>*</span>
              </label>
              {photoPreview && (
                <div className={styles.photoPreview}>
                  <img src={photoPreview} alt="Preview" />
                </div>
              )}
              <label className={styles.photoDropzone}>
                <span className={styles.photoIcon}>📸</span>
                <span className={styles.photoHint}>
                  {photo ? `✓ ${photo.name}` : 'Clique para selecionar uma imagem'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  required={role === 'motoboy' || role === 'lojista'}
                  className={styles.photoInputHidden}
                />
              </label>
            </div>
          )}

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Cadastrando...' : 'Criar Conta'}
          </button>
        </form>

        <div className={styles.divider}>
          <div className={styles.dividerLine} />
          <span className={styles.dividerLabel}>ou</span>
          <div className={styles.dividerLine} />
        </div>

        <div className={styles.cta}>
          <p className={styles.ctaText}>Já tem uma conta?</p>
          <a href="/login" className={styles.ctaLink}>Fazer Login</a>
        </div>

      </div>
    </div>
  );
}
