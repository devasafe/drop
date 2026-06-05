import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './AdminPricingConfig.module.css';

interface PricingPlan {
  _id: string;
  name: string;
  commission: number;
  motorcycleTaxes: {
    basePerDelivery: number;
    perKm: number;
  };
  minWithdraw: number;
}

export default function PricingConfig() {
  const router = useRouter();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PricingPlan>>({});

  // Carregar planos
  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/pricing-plans');
      setPlans(res.data);
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
      alert('Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (plan: PricingPlan) => {
    setEdited(plan._id);
    setFormData({
      commission: plan.commission,
      motorcycleTaxes: plan.motorcycleTaxes,
      minWithdraw: plan.minWithdraw
    });
  };

  const handleSave = async (planId: string) => {
    try {
      setSaving(true);
      const res = await axios.put(`/api/admin/pricing-plans/${planId}`, formData);
      setPlans(plans.map(p => p._id === planId ? res.data : p));
      setEdited(null);
      alert('Plano atualizado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao salvar plano:', error);
      alert(error.response?.data?.error || 'Erro ao salvar plano');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEdited(null);
    setFormData({});
  };

  const calculateExample = (commission: number) => {
    const total = 100;
    const adminFee = (total * commission) / 100;
    const storeAmount = total - adminFee;
    return { adminFee: adminFee.toFixed(2), storeAmount: storeAmount.toFixed(2) };
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="form" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}><Icon name="settings" size={20} /> Configuração de Planos</h1>
          <p className={styles.pageSubtitle}>Edite as taxas e percentuais da plataforma</p>
        </div>

        <div className={styles.planList}>
          {plans.map(plan => {
            const isEditing = edited === plan._id;
            const commission = isEditing ? (formData.commission ?? plan.commission) : plan.commission;
            const example = calculateExample(commission);

            return (
              <div key={plan._id} className={styles.planCard}>
                <div className={styles.planGrid}>
                  {/* Informações do Plano */}
                  <div>
                    <h2 className={styles.planName}><Icon name="package" size={16} /> {plan.name}</h2>

                    <div>
                      {/* Comissão */}
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          <Icon name="dollar-sign" size={14} /> Comissão da Plataforma
                        </label>
                        {isEditing ? (
                          <div className={styles.inputRow}>
                            <input
                              type="number"
                              value={formData.commission ?? 0}
                              onChange={(e) => setFormData({ ...formData, commission: Number(e.target.value) })}
                              min="0"
                              max="100"
                              className={`${styles.formInput} ${styles.formInputSmall}`}
                            />
                            <span className={styles.inputPrefix}>%</span>
                          </div>
                        ) : (
                          <div className={styles.fieldValue}>{plan.commission}%</div>
                        )}
                        <p className={styles.fieldNote}>Loja recebe: {100 - commission}%</p>
                      </div>

                      {/* Motoboy - Base */}
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          <Icon name="motorcycle" size={14} /> Ganho Base por Entrega
                        </label>
                        {isEditing ? (
                          <div className={styles.inputRow}>
                            <span className={styles.inputPrefix}>R$</span>
                            <input
                              type="number"
                              value={formData.motorcycleTaxes?.basePerDelivery ?? 0}
                              onChange={(e) => setFormData({
                                ...formData,
                                motorcycleTaxes: {
                                  ...formData.motorcycleTaxes,
                                  basePerDelivery: Number(e.target.value)
                                }
                              })}
                              min="0"
                              step="0.01"
                              className={`${styles.formInput} ${styles.formInputFlex}`}
                            />
                          </div>
                        ) : (
                          <div className={styles.fieldValueNeutral}>R$ {plan.motorcycleTaxes.basePerDelivery.toFixed(2)}</div>
                        )}
                      </div>

                      {/* Motoboy - Por KM */}
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          <Icon name="map-pin" size={14} /> Taxa por Km
                        </label>
                        {isEditing ? (
                          <div className={styles.inputRow}>
                            <span className={styles.inputPrefix}>R$</span>
                            <input
                              type="number"
                              value={formData.motorcycleTaxes?.perKm ?? 0}
                              onChange={(e) => setFormData({
                                ...formData,
                                motorcycleTaxes: {
                                  ...formData.motorcycleTaxes,
                                  perKm: Number(e.target.value)
                                }
                              })}
                              min="0"
                              step="0.01"
                              className={`${styles.formInput} ${styles.formInputFlex}`}
                            />
                            <span className={styles.inputPrefix}>/km</span>
                          </div>
                        ) : (
                          <div className={styles.fieldValueNeutral}>
                            R$ {plan.motorcycleTaxes.perKm.toFixed(2)}/km
                          </div>
                        )}
                        <p className={styles.fieldNote}>
                          Exemplo: 10km = R$ {(plan.motorcycleTaxes.basePerDelivery + 10 * plan.motorcycleTaxes.perKm).toFixed(2)}
                        </p>
                      </div>

                      {/* Saque Mínimo */}
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>
                          <Icon name="credit-card" size={14} /> Valor Mínimo de Saque
                        </label>
                        {isEditing ? (
                          <div className={styles.inputRow}>
                            <span className={styles.inputPrefix}>R$</span>
                            <input
                              type="number"
                              value={formData.minWithdraw ?? 0}
                              onChange={(e) => setFormData({ ...formData, minWithdraw: Number(e.target.value) })}
                              min="0"
                              step="0.01"
                              className={`${styles.formInput} ${styles.formInputFlex}`}
                            />
                          </div>
                        ) : (
                          <div className={styles.fieldValueNeutral}>R$ {plan.minWithdraw.toFixed(2)}</div>
                        )}
                      </div>
                    </div>

                    {/* Botões */}
                    <div className={styles.btnRow}>
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSave(plan._id)}
                            disabled={saving}
                            className={styles.btnSave}
                          >
                            <Icon name="check-circle" size={14} /> Salvar
                          </button>
                          <button
                            onClick={handleCancel}
                            className={styles.btnCancel}
                          >
                            <Icon name="x-circle" size={14} /> Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleEdit(plan)}
                          className={styles.btnEdit}
                        >
                          <Icon name="edit" size={14} /> Editar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Exemplo de Distribuição */}
                  <div className={styles.examplePanel}>
                    <h3 className={styles.exampleTitle}>Exemplo de Distribuição (R$ 100)</h3>

                    <div className={styles.exampleItems}>
                      <div className={styles.exampleItem}>
                        <div className={styles.exampleItemLabel}>Admin (Comissão)</div>
                        <div className={styles.exampleItemValueRed}>R$ {example.adminFee}</div>
                        <div className={styles.exampleItemNote}>{commission}%</div>
                      </div>

                      <div className={styles.exampleItem}>
                        <div className={styles.exampleItemLabel}>Loja (Seu Ganho)</div>
                        <div className={styles.exampleItemValueGreen}>R$ {example.storeAmount}</div>
                        <div className={styles.exampleItemNote}>{100 - commission}%</div>
                      </div>

                      <div className={styles.warningBox}>
                        <Icon name="alert-triangle" size={14} /> Aviso: Alterações Críticas
                        <p>Essas configurações afetam TODOS os pedidos futuros. Mude com cuidado!</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
