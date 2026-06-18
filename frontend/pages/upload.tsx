import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import useRequireAuth from '../hooks/useRequireAuth';
import { API_URL } from '../lib/config';

export default function UploadPage() {
  useRequireAuth(['lojista']);
  const [productId, setProductId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const router = useRouter();

  const onFile = (f: File | null) => {
    setFile(f);
    if (!f) return setPreview(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const submit = async (e: any) => {
    e.preventDefault();
    if (!productId) return alert('Informe productId');
    if (!file) return alert('Escolha um arquivo');

    if (!localStorage.getItem('user')) return alert('Faça login como lojista antes');

    const fd = new FormData();
    fd.append('image', file as any);

    try {
      const res = await axios.post(`${API_URL}/uploads/product/${productId}`, fd, {
        withCredentials: true,
      });
      alert('Upload OK');
      router.push('/');
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Upload falhou');
    }
  };

  return (
    <div>
      <h1>Upload de imagem (lojista)</h1>
      <form onSubmit={submit}>
        <div>
          <label>Product ID</label>
          <input value={productId} onChange={(e) => setProductId(e.target.value)} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Arquivo</label>
          <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files ? e.target.files[0] : null)} />
        </div>
        {preview && (
          <div style={{ marginTop: 8 }}>
            <img src={preview} alt="preview" style={{ width: 200, height: 200, objectFit: 'cover' }} />
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button type="submit">Enviar</button>
        </div>
      </form>
    </div>
  );
}
