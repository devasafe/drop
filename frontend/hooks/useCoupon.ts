import { useState } from 'react';
import api from '../lib/api';

interface Params { storeId: string; subtotal: number; }
type Msg = { type: 'ok' | 'error'; text: string } | null;

export function useCoupon({ storeId, subtotal }: Params) {
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [message, setMessage] = useState<Msg>(null);
  const [validating, setValidating] = useState(false);

  const apply = async () => {
    if (!code.trim()) return;
    setValidating(true);
    setMessage(null);
    try {
      const res = await api.post('/coupons/validate', { code: code.trim(), storeId, orderValue: subtotal });
      setDiscount(res.data.discount);
      setMessage({ type: 'ok', text: `Cupom aplicado! Desconto de ${res.data.discount.toFixed(2)}` });
    } catch (err: any) {
      setDiscount(0);
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Cupom inválido' });
    } finally {
      setValidating(false);
    }
  };

  const remove = () => { setCode(''); setDiscount(0); setMessage(null); };

  return { code, setCode, discount, message, validating, apply, remove };
}
