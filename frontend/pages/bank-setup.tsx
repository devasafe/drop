import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import Icon from '@/components/Icon';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import styles from './BankSetup.module.css';

interface BankInfo {
  banco: string;
  agencia: string;
  conta: string;
  cpfBanco: string;
}

export default function BankSetup() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || { loading: true };

  const [pageLoading, setPageLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [bankInfo, setBankInfo] = useState<BankInfo>({
    banco: '',
    agencia: '',
    conta: '',
    cpfBanco: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Carrega estado dos dados bancários
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const loadBankInfo = async () => {
      try {
        const res = await api.get('/user/bank-info');
        setIsConfigured(res.data.isConfigured);
        if (res.data.bankInfo) {
          setBankInfo(res.data.bankInfo);
        }
      } catch (err) {
        console.error('Erro ao carregar dados bancários:', err);
      } finally {
        setPageLoading(false);
      }
    };

    loadBankInfo();
  }, [user, authLoading, router]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!bankInfo.banco.trim()) newErrors.banco = 'Banco é obrigatório';
    if (!bankInfo.agencia.trim()) newErrors.agencia = 'Agência é obrigatória';
    if (!bankInfo.conta.trim()) newErrors.conta = 'Conta é obrigatória';
    if (!bankInfo.cpfBanco.trim()) {
      newErrors.cpfBanco = 'CPF é obrigatório';
    } else if (!/^\d{11}$/.test(bankInfo.cpfBanco)) {
      newErrors.cpfBanco = 'CPF deve ter exatamente 11 dígitos';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove não-números para CPF
    if (name === 'cpfBanco') {
      setBankInfo((prev) => ({
        ...prev,
        [name]: value.replace(/\D/g, '')
      }));
    } else {
      setBankInfo((prev) => ({
        ...prev,
        [name]: value
      }));
    }

    // Remove erro do campo ao começar a digitar
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);
    try {
      const res = await api.post('/user/bank-info', bankInfo);

      setSuccessMessage('Dados bancários configurados com sucesso!');
      setIsConfigured(true);

      setTimeout(() => {
        router.push('/my-wallet');
      }, 2000);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao salvar dados bancários';
      setErrors({ submit: errorMsg });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || pageLoading) {
    return (
      <div className={styles.loading}>
        <LoadingSkeleton variant="form" />
      </div>
    );
  }

  if (!user) return null;

  // Se já foi configurado, mostra mensagem
  if (isConfigured) {
    return (
      <div className={styles.configuredWrapper}>
        <h1 className={styles.configuredTitle}>
          <Icon name="check-circle" size={20} /> Dados Bancários Configurados
        </h1>
        <p className={styles.configuredText}>
          Seus dados bancários já foram configurados. Você será direcionado para sua carteira em breve...
        </p>
        <button
          onClick={() => router.push('/my-wallet')}
          className={styles.btnGoToWallet}
        >
          Ir para Minha Carteira
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          <Icon name="bank" size={20} /> Configurar Dados Bancários
        </h1>
        <p className={styles.pageSubtitle}>
          Configure seus dados bancários para poder fazer saques da sua carteira.
          <br />
          <strong><Icon name="alert-triangle" size={14} /> Esta configuração será feita apenas uma vez e não poderá ser alterada.</strong>
        </p>
      </div>

      {/* FORM */}
      <form onSubmit={handleSubmit} className={styles.formCard}>
        {/* Erro geral */}
        {errors.submit && (
          <div className={styles.alertError}>
            {errors.submit}
          </div>
        )}

        {/* Mensagem de sucesso */}
        {successMessage && (
          <div className={styles.alertSuccess}>
            {successMessage}
          </div>
        )}

        {/* Campo: Banco */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Nome do Banco *
          </label>
          <input
            type="text"
            name="banco"
            placeholder="Ex: Banco Itaú, Banco do Brasil, Bradesco"
            value={bankInfo.banco}
            onChange={handleChange}
            disabled={saving}
            className={`${styles.input} ${errors.banco ? styles.inputError : ''}`}
          />
          {errors.banco && (
            <p className={styles.fieldError}>
              {errors.banco}
            </p>
          )}
        </div>

        {/* Campo: Agência */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Agência *
          </label>
          <input
            type="text"
            name="agencia"
            placeholder="Ex: 0001"
            value={bankInfo.agencia}
            onChange={handleChange}
            disabled={saving}
            className={`${styles.input} ${errors.agencia ? styles.inputError : ''}`}
          />
          {errors.agencia && (
            <p className={styles.fieldError}>
              {errors.agencia}
            </p>
          )}
        </div>

        {/* Campo: Conta */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            Número da Conta *
          </label>
          <input
            type="text"
            name="conta"
            placeholder="Ex: 12345-67"
            value={bankInfo.conta}
            onChange={handleChange}
            disabled={saving}
            className={`${styles.input} ${errors.conta ? styles.inputError : ''}`}
          />
          {errors.conta && (
            <p className={styles.fieldError}>
              {errors.conta}
            </p>
          )}
        </div>

        {/* Campo: CPF */}
        <div className={styles.formGroupLast}>
          <label className={styles.label}>
            CPF (11 dígitos) *
          </label>
          <input
            type="text"
            name="cpfBanco"
            placeholder="00000000000"
            value={bankInfo.cpfBanco}
            onChange={handleChange}
            disabled={saving}
            maxLength={11}
            className={`${styles.input} ${errors.cpfBanco ? styles.inputError : ''}`}
          />
          {errors.cpfBanco && (
            <p className={styles.fieldError}>
              {errors.cpfBanco}
            </p>
          )}
        </div>

        {/* BOTÕES */}
        <div className={styles.formActions}>
          <button
            type="button"
            onClick={() => router.push('/my-wallet')}
            disabled={saving}
            className={styles.btnBack}
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={saving}
            className={styles.btnSubmit}
          >
            {saving ? 'Salvando...' : 'Confirmar Dados'}
          </button>
        </div>
      </form>

      {/* INFO BOX */}
      <div className={styles.infoBox}>
        <p className={styles.infoBoxTitle}><Icon name="info" size={14} /> Informações Importantes</p>
        <ul className={styles.infoBoxList}>
          <li>Seus dados bancários são usados apenas para saques</li>
          <li>Uma vez configurado, não pode ser alterado</li>
          <li>Certifique-se de que os dados estão corretos antes de confirmar</li>
          <li>Saques podem levar até 2 dias úteis para aparecer em sua conta</li>
        </ul>
      </div>
    </div>
  );
}
