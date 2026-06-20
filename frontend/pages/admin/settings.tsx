import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './AdminSettings.module.css';

interface PlatformConfig {
  _id?: string;
  commissionPlan1: number;
  commissionPlan2: number;
  commissionPlan3: number;
  motoboyCutPerDelivery: number;
  motoboyCutPerKm: number;
  motoboyMinimumWithdraw: number;
  motoboyCommissionPercent: number; // ✨ NOVO
  updatedAt?: string;
  updatedBy?: string;
}

export default function AdminSettings() {
  const router = useRouter();
  const { user, loading: authLoading, can, permissionsLoading } = useAuth() as any;
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [editConfig, setEditConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Verificar permissão
  useEffect(() => {
    if (!authLoading && !permissionsLoading && user && !can('settings:manage')) {
      router.push('/access-denied');
    }
  }, [user, authLoading, permissionsLoading, can, router]);

  // Carregar configurações
  useEffect(() => {
    if (!permissionsLoading && can('settings:manage')) {
      loadConfig();
    }
  }, [user, permissionsLoading]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings/platform-config');
      setConfig(res.data);
      setEditConfig(res.data);
      setMessage(null);
    } catch (err: any) {
      console.error('Erro ao carregar config:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar configurações' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editConfig) return;

    setSaving(true);
    try {
      const res = await api.put('/settings/platform-config', editConfig);
      setConfig(res.data);
      setEditConfig(res.data);
      setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setMessage({
        type: 'error',
        text: err?.response?.data?.error || 'Erro ao salvar configurações'
      });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <ProtectedRoute required_permission="settings:manage">
        <div className={styles.loadingScreen}>
          <LoadingSkeleton variant="form" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_permission="settings:manage">
      <div className={styles.page}>
        <h1 className={styles.pageTitle}><Icon name="settings" size={20} /> Configurações do Sistema</h1>
        <p className={styles.pageSub}>
          Edite as taxas e percentuais da plataforma
        </p>

        {message && (
          <div className={message.type === 'success' ? styles.messageSuccess : styles.messageError}>
            {message.text}
          </div>
        )}

        {editConfig && (
          <>
            {/* Comissões */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Icon name="wallet" size={16} /> Comissões por Plano
              </h2>

              <div className={styles.fieldsGrid}>
                {/* Plan 1 */}
                <div className={styles.fieldCard}>
                  <h3 className={styles.fieldCardTitle}><Icon name="package" size={14} /> Plano 1 (Marketplace Only)</h3>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Taxa de Comissão (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editConfig.commissionPlan1 || 0}
                      onChange={(e) => setEditConfig({ ...editConfig, commissionPlan1: parseFloat(e.target.value) })}
                      className={styles.fieldInput}
                    />
                  </div>
                  <p className={styles.fieldHint}>
                    Loja recebe: {100 - (editConfig.commissionPlan1 || 0)}%
                  </p>
                </div>

                {/* Plan 2 */}
                <div className={styles.fieldCard}>
                  <h3 className={styles.fieldCardTitle}><Icon name="package" size={14} /> Plano 2 (Marketplace + Motoboys)</h3>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Taxa de Comissão (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editConfig.commissionPlan2 || 0}
                      onChange={(e) => setEditConfig({ ...editConfig, commissionPlan2: parseFloat(e.target.value) })}
                      className={styles.fieldInput}
                    />
                  </div>
                  <p className={styles.fieldHint}>
                    Loja recebe: {100 - (editConfig.commissionPlan2 || 0)}%
                  </p>
                </div>

                {/* Plan 3 */}
                <div className={styles.fieldCard}>
                  <h3 className={styles.fieldCardTitle}><Icon name="package" size={14} /> Plano 3 (Premium)</h3>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      Taxa de Comissão (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editConfig.commissionPlan3 || 0}
                      onChange={(e) => setEditConfig({ ...editConfig, commissionPlan3: parseFloat(e.target.value) })}
                      className={styles.fieldInput}
                    />
                  </div>
                  <p className={styles.fieldHint}>
                    Loja recebe: {100 - (editConfig.commissionPlan3 || 0)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Ganhos Motoboy */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Icon name="motorcycle" size={16} /> Ganhos Motoboy
              </h2>

              <div className={styles.fieldsGrid}>
                {/* Ganho Base por Entrega */}
                <div>
                  <label className={styles.fieldLabel}>
                    <Icon name="money" size={14} /> Ganho Base por Entrega
                  </label>
                  <div className={styles.inputRow}>
                    <span className={styles.inputPrefix}>R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editConfig.motoboyCutPerDelivery || 0}
                      onChange={(e) => setEditConfig({ ...editConfig, motoboyCutPerDelivery: parseFloat(e.target.value) })}
                      className={styles.fieldInputFlex}
                    />
                  </div>
                  <p className={styles.fieldHintSmall}>
                    Base: R$ {(editConfig.motoboyCutPerDelivery || 0).toFixed(2)}
                  </p>
                </div>

                {/* Taxa por Km */}
                <div>
                  <label className={styles.fieldLabel}>
                    <Icon name="map-pin" size={14} /> Taxa por Km
                  </label>
                  <div className={styles.inputRow}>
                    <span className={styles.inputPrefix}>R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editConfig.motoboyCutPerKm || 0}
                      onChange={(e) => setEditConfig({ ...editConfig, motoboyCutPerKm: parseFloat(e.target.value) })}
                      className={styles.fieldInputFlex}
                    />
                    <span className={styles.inputSuffix}>/km</span>
                  </div>
                  <p className={styles.fieldHintSmall}>
                    Exemplo: 10km = R$ {(10 * (editConfig.motoboyCutPerKm || 0)).toFixed(2)}
                  </p>
                </div>

                {/* Valor Mínimo de Saque */}
                <div>
                  <label className={styles.fieldLabel}>
                    <Icon name="credit-card" size={14} /> Valor Mínimo de Saque
                  </label>
                  <div className={styles.inputRow}>
                    <span className={styles.inputPrefix}>R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editConfig.motoboyMinimumWithdraw || 0}
                      onChange={(e) => setEditConfig({ ...editConfig, motoboyMinimumWithdraw: parseFloat(e.target.value) })}
                      className={styles.fieldInputFlex}
                    />
                  </div>
                  <p className={styles.fieldHintSmall}>
                    Saldo mínimo para solicitar saque
                  </p>
                </div>

                {/* ✨ NOVO: Comissão do Motoboy para o App */}
                <div>
                  <label className={styles.fieldLabel}>
                    <Icon name="percent" size={14} /> Comissão do Motoboy para o App (%)
                  </label>
                  <div className={styles.inputRow}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={editConfig.motoboyCommissionPercent || 0}
                      onChange={(e) => setEditConfig({ ...editConfig, motoboyCommissionPercent: parseFloat(e.target.value) })}
                      className={styles.fieldInputFlex}
                    />
                    <span className={styles.inputSuffix}>%</span>
                  </div>
                  <p className={styles.fieldHintSmall}>
                    % da taxa de entrega que fica no caixa do app
                  </p>
                  <p className={styles.fieldHintBlue}>
                    Exemplo: Taxa R$10 com {(editConfig.motoboyCommissionPercent || 0).toFixed(1)}% = Motoboy ganha R${(10 * (1 - (editConfig.motoboyCommissionPercent || 0) / 100)).toFixed(2)}, App recebe R${(10 * ((editConfig.motoboyCommissionPercent || 0) / 100)).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className={styles.btnRow}>
              <button
                onClick={() => setEditConfig(config)}
                className={styles.btnCancel}
              >
                <Icon name="x" size={14} /> Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={styles.btnSave}
              >
                {saving ? 'Salvando...' : <><Icon name="check" size={14} /> Salvar Configurações</>}
              </button>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
