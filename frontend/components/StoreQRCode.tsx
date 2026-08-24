import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import styles from './StoreQRCode.module.css';

interface Props {
  /** slug preferido; cai no _id se não houver */
  storeRef: string;
  storeName?: string;
}

/**
 * QR Code da loja para o lojista imprimir/colar na vitrine. Gera o PNG localmente
 * (lib `qrcode`, sem serviço externo). Fundo sempre branco + módulos escuros para
 * ler bem em qualquer tema. Aponta para a página pública `${origin}/stores/${ref}`.
 */
export default function StoreQRCode({ storeRef, storeName }: Props) {
  const { showToast } = useToast();
  const [dataUrl, setDataUrl] = useState<string>('');
  const linkRef = useRef<HTMLAnchorElement>(null);

  // origin só existe no client → monta a URL depois de montar (evita mismatch de SSR).
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const url = useMemo(() => (origin ? `${origin}/stores/${storeRef}` : ''), [origin, storeRef]);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, {
      width: 512, margin: 2, errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    })
      .then((d) => { if (alive) setDataUrl(d); })
      .catch(() => { if (alive) showToast('Não foi possível gerar o QR Code.', 'error'); });
    return () => { alive = false; };
  }, [url, showToast]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copiado!', 'success');
    } catch {
      showToast('Não foi possível copiar. Copie manualmente abaixo.', 'error');
    }
  };

  const download = () => {
    if (!dataUrl || !linkRef.current) return;
    const safe = (storeName || 'loja').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    linkRef.current.href = dataUrl;
    linkRef.current.download = `qrcode-${safe || 'loja'}.png`;
    linkRef.current.click();
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.desc}>
        Imprima e cole na vitrine, no balcão ou na embalagem. Quem apontar a câmera cai
        direto na sua página no DROP.
      </p>
      <div className={styles.body}>
        <div className={styles.qrFrame}>
          {dataUrl
            ? <img src={dataUrl} alt={`QR Code de ${storeName || 'sua loja'}`} className={styles.qrImg} />
            : <div className={styles.qrPlaceholder} aria-hidden="true" />}
        </div>
        <div className={styles.side}>
          <span className={styles.linkLabel}>Link da sua página</span>
          <code className={styles.link}>{url || '…'}</code>
          <div className={styles.actions}>
            <Button onClick={copyLink} variant="ghost" size="sm" disabled={!url}>Copiar link</Button>
            <Button onClick={download} size="sm" disabled={!dataUrl}>Baixar QR Code</Button>
          </div>
        </div>
      </div>
      {/* âncora oculta usada pelo download programático */}
      <a ref={linkRef} className={styles.hiddenLink} aria-hidden="true" tabIndex={-1}>download</a>
    </div>
  );
}
