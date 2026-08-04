import Link from 'next/link';
import styles from './Footer.module.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>

        {/* Brand */}
        <div className={styles.brand}>
          <img src="/images/logog_png.png" alt="DROP" className={styles.logo} />
          <p className={styles.tagline}>
            O marketplace que conecta você às melhores lojas da sua cidade.
          </p>
        </div>

        {/* Links */}
        <div className={styles.linksGrid}>
          <div className={styles.col}>
            <div className={styles.colTitle}>Explorar</div>
            <Link href="/" className={styles.link}>Produtos</Link>
            <Link href="/stores" className={styles.link}>Lojas</Link>
          </div>

          <div className={styles.col}>
            <div className={styles.colTitle}>Para Lojistas</div>
            <Link href="/seller/create-store" className={styles.link}>Abrir minha loja</Link>
            <Link href="/seller/dashboard" className={styles.link}>Painel do Lojista</Link>
            <Link href="/seller/select-plan" className={styles.link}>Planos</Link>
          </div>

          <div className={styles.col}>
            <div className={styles.colTitle}>Para Motoboys</div>
            <Link href="/register" className={styles.link}>Cadastrar-se</Link>
            <Link href="/motoboy" className={styles.link}>Painel do Motoboy</Link>
          </div>

          <div className={styles.col}>
            <div className={styles.colTitle}>Conta</div>
            <Link href="/login" className={styles.link}>Entrar</Link>
            <Link href="/register" className={styles.link}>Cadastrar</Link>
            <Link href="/user-dashboard" className={styles.link}>Meus Pedidos</Link>
            <Link href="/wallet" className={styles.link}>Minha Carteira</Link>
          </div>

          <div className={styles.col}>
            <div className={styles.colTitle}>Legal</div>
            <Link href="/termos" className={styles.link}>Termos de Uso</Link>
            <Link href="/privacidade" className={styles.link}>Política de Privacidade</Link>
            <Link href="/cookies" className={styles.link}>Política de Cookies</Link>
            <Link href="/privacidade/solicitacoes" className={styles.link}>Seus dados (LGPD)</Link>
          </div>
        </div>

      </div>

      {/* Bottom bar */}
      <div className={styles.bottom}>
        <div className={styles.bottomInner}>
          <span className={styles.copy}>© {year} DROP. Todos os direitos reservados.</span>
          <div className={styles.bottomLinks}>
            <span className={styles.bottomLink}>Termos de Uso</span>
            <span className={styles.dot}>·</span>
            <span className={styles.bottomLink}>Privacidade</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
