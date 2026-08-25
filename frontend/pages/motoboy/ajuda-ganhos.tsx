import { useRouter } from 'next/router';
import { ChevronLeft, Package, Clock, Wallet, Send, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import styles from './AjudaGanhos.module.css';

const CICLO = [
  { icon: Package, tone: 'brand', title: 'Você ganhou', desc: 'Ao concluir uma entrega, o valor da corrida entra na sua carteira como um repasse.' },
  { icon: Clock, tone: 'brand', title: 'Pendente (a liberar)', desc: 'O valor fica um tempo em análise/liberação antes de poder ser sacado. É normal e temporário.' },
  { icon: Wallet, tone: 'success', title: 'Disponível para saque', desc: 'Liberado! Esse é o valor que você pode transferir para o seu PIX agora.' },
  { icon: Send, tone: 'warn', title: 'Saque solicitado', desc: 'Você pediu o saque. Fica "em processamento" até o pagamento ser efetivado.' },
  { icon: CheckCircle2, tone: 'success', title: 'Pago', desc: 'O dinheiro caiu na sua chave PIX. Entra no seu "Total já sacado".' },
];

export default function AjudaGanhos() {
  const router = useRouter();
  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <button className={styles.back} onClick={() => router.back()}>
            <ChevronLeft size={18} aria-hidden="true" /> Voltar
          </button>

          <header className={styles.header}>
            <h1 className={styles.title}>Como funcionam os ganhos e saques</h1>
            <p className={styles.subtitle}>Entenda o caminho do seu dinheiro, do fim da entrega até cair no seu PIX.</p>
          </header>

          {/* Ciclo do dinheiro */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>O ciclo do seu dinheiro</h2>
            <div className={styles.timeline}>
              {CICLO.map((s, i) => {
                const Ico = s.icon;
                return (
                  <div key={i} className={styles.step}>
                    <div className={styles.stepRail}>
                      <span className={`${styles.stepDot} ${styles[s.tone]}`}><Ico size={16} aria-hidden="true" /></span>
                      {i < CICLO.length - 1 && <span className={styles.stepLine} />}
                    </div>
                    <div className={styles.stepText}>
                      <span className={styles.stepTitle}>{s.title}</span>
                      <span className={styles.stepDesc}>{s.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Como sacar */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Como sacar</h2>
            <ul className={styles.list}>
              <li className={styles.item}>
                <span className={styles.itemIcon}><KeyRound size={16} aria-hidden="true" /></span>
                <div>
                  <strong>Cadastre sua chave PIX</strong>
                  <p>Em "Dados de recebimento". O saque cai sempre na chave cadastrada — sem ela, não é possível sacar.</p>
                </div>
              </li>
              <li className={styles.item}>
                <span className={styles.itemIcon}><Wallet size={16} aria-hidden="true" /></span>
                <div>
                  <strong>Você escolhe o valor</strong>
                  <p>Pode sacar tudo que está disponível ou um valor menor. Atenção ao limite diário do PIX (costuma ser R$ 8.000): para valores maiores, saque em partes.</p>
                </div>
              </li>
              <li className={styles.item}>
                <span className={styles.itemIcon}><Package size={16} aria-hidden="true" /></span>
                <div>
                  <strong>O saque usa repasses inteiros</strong>
                  <p>Cada entrega gera um repasse. Se o valor escolhido não fechar exato com os repasses, o saque cai no maior valor possível abaixo do que você pediu.</p>
                </div>
              </li>
              <li className={styles.item}>
                <span className={styles.itemIcon}><ShieldCheck size={16} aria-hidden="true" /></span>
                <div>
                  <strong>Acompanhe pelo Extrato</strong>
                  <p>Cada ganho e cada saque aparece no extrato com o status atual (Disponível, Solicitado, Pago…).</p>
                </div>
              </li>
            </ul>
          </section>

          <p className={styles.foot}>
            Total ganho = pendente + disponível + saque solicitado + total já sacado.
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
