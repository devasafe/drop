import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import Icon from '../../components/Icon';

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

interface PlanWithExample extends PricingPlan {
  example?: {
    orderAmount: number;
    adminCommission: number;
    storeAmount: number;
    percentages: {
      admin: number;
      store: number;
    }
  }
}

const PLAN_BENEFITS: { [key: string]: string[] } = {
  'Plano 1 (Marketplace Only)': [
    '+ Venda de produtos',
    '+ Gerenciamento de estoque',
    '+ Pedidos e entregas',
    '- Sistema de motoboys'
  ],
  'Plano 2 (Marketplace + Motoboys)': [
    '+ Venda de produtos',
    '+ Gerenciamento de estoque',
    '+ Pedidos e entregas',
    '+ Sistema de motoboys',
    '+ Suporte básico'
  ],
  'Plano 3 (Premium)': [
    '+ Venda de produtos',
    '+ Gerenciamento de estoque',
    '+ Pedidos e entregas',
    '+ Sistema de motoboys',
    '+ Suporte 24/7',
    '+ Analytics avançado',
    '+ Marketing tools'
  ]
};

export default function PlanSelection() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanWithExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Carregar planos
  useEffect(() => {
    fetchPlans();
    fetchCurrentPlan();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/pricing-plans');
      
      // Buscar detalhes de cada plano (com exemplo de distribuição)
      const plansWithDetails = await Promise.all(
        res.data.map(async (plan: PricingPlan) => {
          const detailRes = await axios.get(`/api/admin/pricing-plans/${plan._id}`);
          return detailRes.data;
        })
      );
      
      setPlans(plansWithDetails);
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
      alert('Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentPlan = async () => {
    try {
      const res = await axios.get('/api/store/plan');
      if (res.data.planId) {
        setCurrentPlanId(res.data.planId);
      }
    } catch (error) {
      console.error('Erro ao carregar plano atual:', error);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    try {
      setSelecting(planId);
      await axios.put('/api/store/plan', { planId });
      setCurrentPlanId(planId);
      alert('Plano alterado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao selecionar plano:', error);
      alert(error.response?.data?.error || 'Erro ao selecionar plano');
    } finally {
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Carregando planos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-2"><Icon name="chart-bar" size={24} /> Escolha seu Plano</h1>
          <p className="text-gray-600 text-lg">Selecione o plano que melhor se adequa ao seu negócio</p>
        </div>

        {/* Cards de Planos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {plans.map(plan => {
            const benefits = PLAN_BENEFITS[plan.name] || [];
            const isSelected = currentPlanId === plan._id;
            const isSelecting = selecting === plan._id;
            
            return (
              <div
                key={plan._id}
                className={`rounded-lg shadow-lg overflow-hidden transition-all transform ${
                  isSelected
                    ? 'ring-2 ring-green-500 scale-105 bg-white'
                    : 'bg-white hover:shadow-xl'
                }`}
              >
                {/* Badge de Seleção */}
                {isSelected && (
                  <div className="bg-green-500 text-white px-4 py-2 text-center text-sm font-bold">
                    <Icon name="check-circle" size={14} /> Seu Plano Atual
                  </div>
                )}

                {/* Conteúdo do Card */}
                <div className="p-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">{plan.name}</h2>
                  
                  {/* Comissão */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-1">Sua Comissão</p>
                    <div className="text-3xl font-bold text-blue-600">
                      {100 - plan.commission}%
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Você recebe por venda</p>
                  </div>

                  {/* Exemplo de Distribuição */}
                  {plan.example && (
                    <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-gray-600 mb-2">Exemplo (Venda de R$ 100)</p>
                      <div className="flex justify-between">
                        <span className="font-semibold">Você recebe:</span>
                        <span className="text-green-600 font-bold">R$ {plan.example.storeAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between mt-1 text-sm text-gray-600">
                        <span>Platform recebe:</span>
                        <span>R$ {plan.example.adminCommission.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Benefícios */}
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-gray-700 mb-3">O que está incluído:</p>
                    <ul className="space-y-2">
                      {benefits.map((benefit, idx) => {
                        const included = benefit.startsWith('+ ');
                        const text = benefit.slice(2);
                        return (
                          <li key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                            <Icon name={included ? 'check-circle' : 'x-circle'} size={14} />
                            {text}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Configurações de Motoboy */}
                  <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm font-semibold text-gray-700 mb-2"><Icon name="motorcycle" size={14} /> Configuração de Motoboys</p>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Base por entrega: <span className="font-semibold">R$ {plan.motorcycleTaxes.basePerDelivery.toFixed(2)}</span></div>
                      <div>Por km: <span className="font-semibold">R$ {plan.motorcycleTaxes.perKm.toFixed(2)}</span></div>
                      <div className="text-xs text-gray-500 mt-2">
                        Exemplo: 10km = R$ {(plan.motorcycleTaxes.basePerDelivery + 10 * plan.motorcycleTaxes.perKm).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Botão de Seleção */}
                  {!isSelected && (
                    <button
                      onClick={() => handleSelectPlan(plan._id)}
                      disabled={isSelecting}
                      className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 transition"
                    >
                      {isSelecting ? 'Selecionando...' : 'Escolher este Plano'}
                    </button>
                  )}
                  {isSelected && (
                    <button
                      disabled
                      className="w-full px-4 py-3 bg-green-500 text-white rounded-lg font-bold opacity-75"
                    >
                      <Icon name="check-circle" size={14} /> Plano Ativo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Aviso Importante */}
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <p className="text-red-800 font-semibold"><Icon name="alert-triangle" size={14} /> Aviso Importante</p>
          <p className="text-red-700 text-sm mt-2">
            Alterações no plano afetarão TODOS os seus pedidos futuros. Escolha com cuidado!
          </p>
        </div>
      </div>
    </div>
  );
}
