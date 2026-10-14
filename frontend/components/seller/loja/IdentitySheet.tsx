import { ChangeEvent, useEffect, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { useToast } from '../../ui/Toast';
import api from '../../../lib/api';
import { imageUrl } from '../../../lib/config';
import { apiErrorMessage, payload } from '../../../lib/sellerApi';
import blocks from '../../panel/PanelBlocks.module.css';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const TAGLINE_MAX = 80;

/**
 * Sobe uma imagem da loja e devolve a url (ou null).
 * - logo: POST /stores/:id/logo (campo `logo`, todos os planos), resposta { logoUrl };
 * - cover: POST /stores/banner?type=cover (campo `banner`, todos os planos);
 * - featured: POST /stores/banner?type=featured (campo `banner`, só Premium; o servidor recusa nos outros).
 */
export async function uploadStoreImage(
  storeId: string,
  type: 'cover' | 'logo' | 'featured',
  file: File,
): Promise<string | null> {
  const fd = new FormData();
  if (type === 'logo') {
    fd.append('logo', file);
    const r = await api.post(`/stores/${storeId}/logo`, fd);
    const url = payload(r)?.logoUrl;
    return typeof url === 'string' ? url : null;
  }
  fd.append('banner', file);
  const r = await api.post(`/stores/banner?type=${type}`, fd);
  return typeof r.data?.url === 'string' ? r.data.url : null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string | null | undefined;
  logoUrl?: string | null;
  tagline?: string | null;
  storeName?: string;
  onSaved: () => void;
}

export function IdentitySheet({ open, onClose, storeId, logoUrl, tagline, storeName, onSaved }: Props) {
  const { showToast } = useToast();
  const [text, setText] = useState(tagline || '');
  const [logoBusy, setLogoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setText(tagline || ''); setError(''); }
  }, [open, tagline]);

  const trimmed = text.trim();
  const tooLong = trimmed.length > TAGLINE_MAX;
  const initials = (storeName || 'Loja').split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !storeId) return;
    if (file.size > MAX_IMAGE_BYTES) { setError('A imagem pode ter até 5 MB.'); return; }
    setLogoBusy(true);
    setError('');
    try {
      await uploadStoreImage(storeId, 'logo', file);
      showToast('Logo atualizado', 'success');
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível enviar o logo. Tente de novo.'));
    } finally {
      setLogoBusy(false);
    }
  };

  const save = async () => {
    if (!storeId || tooLong) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/stores/${storeId}`, { tagline: trimmed });
      showToast('Frase salva', 'success');
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível salvar a frase. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Frase e logo" presentation="bottom">
      <div className={blocks.stack}>
        <div className={[blocks.blk, blocks.blkRow].join(' ')}>
          <span className={[blocks.ico, blocks.icoBrand].join(' ')} aria-hidden="true">
            {logoUrl ? <img src={imageUrl(logoUrl)} alt="" width={40} height={40} /> : initials}
          </span>
          <span className={blocks.tx}>
            <b>Logo da loja</b>
            <span>Quadrado, fundo liso. Até 5 MB.</span>
          </span>
          <label className={blocks.fileBtn}>
            {logoBusy ? 'Enviando…' : 'Trocar logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={blocks.hiddenInput}
              aria-label="Escolher o logo da loja"
              disabled={logoBusy}
              onChange={onLogo}
            />
          </label>
        </div>
        <Input
          label="Frase da loja"
          value={text}
          onChange={setText}
          placeholder="Ex.: Som, carga e proteção pro seu celular"
          hint={`${trimmed.length}/${TAGLINE_MAX} · aparece no topo da sua loja`}
          error={tooLong ? 'Use até 80 caracteres.' : undefined}
        />
        {error && <p role="alert" className={blocks.errText}>{error}</p>}
        <Button onClick={save} loading={saving} disabled={tooLong || !storeId}>Salvar frase</Button>
      </div>
    </Sheet>
  );
}

export default IdentitySheet;
