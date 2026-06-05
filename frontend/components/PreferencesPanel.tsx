import React, { useState, useEffect } from 'react';
import api from '../lib/api';

interface PreferencesPanelProps {
  addresses: any[];
  user: any;
  setUser: (u: any) => void;
}

export default function PreferencesPanel({ addresses, user, setUser }: PreferencesPanelProps) {
  const [preferences, setPreferences] = useState({
    defaultAddress: user?.preferences?.defaultAddress || '',
    defaultPayment: user?.preferences?.defaultPayment || ''
  });

  useEffect(() => {
    setPreferences({
      defaultAddress: user?.preferences?.defaultAddress || '',
      defaultPayment: user?.preferences?.defaultPayment || ''
    });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/me/preferences', preferences);
      setUser({ ...user, preferences });
      alert('Preferências salvas!');
    } catch {
      alert('Erro ao salvar preferências');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <label><b>Endereço padrão:</b></label><br />
        <select
          value={preferences.defaultAddress}
          onChange={e => setPreferences(p => ({ ...p, defaultAddress: e.target.value }))}
          style={{ width: 300, padding: 4 }}
        >
          <option value="">Selecione...</option>
          {addresses.map((addr, idx) => (
            <option key={addr._id || idx} value={addr._id || idx}>
              {addr.label || `${addr.street}, ${addr.number} - ${addr.city}`}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label><b>Método de pagamento padrão:</b></label><br />
        <select
          value={preferences.defaultPayment}
          onChange={e => setPreferences(p => ({ ...p, defaultPayment: e.target.value }))}
          style={{ width: 300, padding: 4 }}
        >
          <option value="">Selecione...</option>
          <option value="pix">Pix</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="cartao">Cartão</option>
        </select>
      </div>
      <button type="submit">Salvar preferências</button>
    </form>
  );
}
