import Link from 'next/link';
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import api from '../lib/api';
import { useNotifications } from '../hooks/useSync';
import Icon, { IconName } from './Icon';
import { visibleAdminMenu } from '../lib/adminMenu';
import styles from './Nav.module.css';

const ROLE_META: Record<string, { icon: IconName; label: string }> = {
  cliente:           { icon: 'shopping-bag', label: 'Cliente' },
  lojista:           { icon: 'store',        label: 'Lojista' },
  motoboy:           { icon: 'truck',        label: 'Motoboy' },
  ceo:               { icon: 'shield',       label: 'CEO' },
  admin:             { icon: 'settings',     label: 'Admin' },
  marketing:         { icon: 'megaphone',    label: 'Marketing' },
  gerente_geral:     { icon: 'briefcase',    label: 'Gerente Geral' },
  gerente_clientes:  { icon: 'chat',         label: 'Ger. Clientes' },
  gerente_lojistas:  { icon: 'store',        label: 'Ger. Lojistas' },
  gerente_motoboys:  { icon: 'truck',        label: 'Ger. Motoboys' },
};

export default function Nav() {
  const { user, logout, switchRole, can } = useAuth() || {};
  const { cart } = useCart() || { cart: [] };
  const router = useRouter();
  const count = cart ? cart.reduce((s: number, it: any) => s + (it.quantity || 0), 0) : 0;
  const [showMenu, setShowMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Lock body scroll quando menu mobile aberto (iOS Safari compatible)
  useEffect(() => {
    if (mobileMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);
  const [hasStore, setHasStore] = useState<boolean | null>(null);
  const { unreadCount: notifUnreadCount } = useNotifications();
  const menuRef = useRef<HTMLDivElement>(null);

  const activeRole = user?.activeRole || user?.role || 'cliente';
  const roles: string[] = user?.roles || (user?.role ? [user.role] : []);
  // Itens do painel admin que ESTE usuário pode ver (por permissão; CEO vê tudo).
  const adminItems = can ? visibleAdminMenu(can, activeRole === 'ceo') : [];
  const isAdmin = adminItems.length > 0;
  const adminHome = adminItems[0]?.href || '/admin/dashboard';
  const otherRoles = roles.filter((r: string) => r !== activeRole);
  const meta = ROLE_META[activeRole] || { icon: 'user' as IconName, label: activeRole };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!user || activeRole !== 'lojista') { setHasStore(false); return; }
    const load = async () => {
      try {
        // Detecta a loja do dono direto no backend (não depende de /stores,
        // que filtra por verificação e fazia a loja "sumir" do menu).
        await api.get('/stores/dashboard');
        if (mounted) setHasStore(true);
      } catch { if (mounted) setHasStore(false); }
    };
    load();
    return () => { mounted = false; };
  }, [user, activeRole]);

  const go = (href: string) => { setShowMenu(false); router.push(href); };
  const close = () => setShowMenu(false);
  const unread = notifUnreadCount;
  const isActive = (path: string) => router.pathname === path || router.pathname.startsWith(path + '/');

  return (
    <>
    <header className={styles.header}>
      <nav className={styles.nav}>

        {/* Logo */}
        <Link href="/inicio" className={styles.logo}>
          <img src="/images/logog_png.png" alt="DROP" />
        </Link>

        {/* Center Links */}
        <div className={styles.centerLinks}>
          <Link href="/" className={`${styles.navLink} ${isActive('/') && router.pathname === '/' ? styles.navLinkActive : ''}`}>
            Produtos
          </Link>
          <Link href="/stores" className={`${styles.navLink} ${isActive('/stores') ? styles.navLinkActive : ''}`}>
            Lojas
          </Link>
          {isAdmin && (
            <Link href={adminHome} className={`${styles.navLink} ${styles.navLinkAdmin} ${isActive('/admin') ? styles.navLinkActive : ''}`}>
              <Icon name={meta.icon} size={14} /> Painel
            </Link>
          )}
        </div>

        {/* Right Section */}
        <div className={styles.right}>
          {/* Botão hamburger — só aparece em tablet/mobile via CSS */}
          <button
            className={styles.hamburger}
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          {user ? (
            <>
              {/* Carrinho */}
              {activeRole === 'cliente' && (
                <Link href="/checkout" className={`${styles.iconBtn} ${count > 0 ? styles.iconBtnActive : ''}`} title="Carrinho">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                  </svg>
                  {count > 0 && <span className={styles.badge}>{count}</span>}
                </Link>
              )}

              {/* Notificações */}
              <Link href="/notifications" className={styles.iconBtn} title="Notificações">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
              </Link>

              {/* Menu do usuário */}
              <div className={styles.menuWrap} ref={menuRef}>
                <button
                  className={`${styles.trigger} ${showMenu ? styles.triggerOpen : ''}`}
                  onClick={() => setShowMenu(v => !v)}
                >
                  <span className={styles.avatar}>{user.name.charAt(0).toUpperCase()}</span>
                  <span className={styles.triggerName}>{user.name.split(' ')[0]}</span>
                  <svg className={`${styles.chevron} ${showMenu ? styles.chevronOpen : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {showMenu && (
                  <div className={`${styles.dropdown} ${isAdmin ? styles.dropdownWide : ''}`}>

                    {/* Header com avatar e role */}
                    <div className={styles.dropHead}>
                      <div className={styles.dropAvatar}>{user.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className={styles.dropName}>{user.name}</div>
                        <span className={styles.rolePill}><Icon name={meta.icon} size={12} /> {meta.label}</span>
                      </div>
                    </div>

                    {/* Trocar de role */}
                    {otherRoles.length > 0 && (
                      <div className={styles.section}>
                        <div className={styles.sectionLabel}>Alternar para</div>
                        <div className={styles.roleGrid}>
                          {otherRoles.map((r: string) => {
                            const m = ROLE_META[r] || { icon: 'user' as IconName, label: r };
                            return (
                              <button key={r} className={styles.roleChip} onClick={() => { switchRole?.(r); close(); router.push('/inicio'); }}>
                                <Icon name={m.icon} size={12} /> {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Links pessoais */}
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Conta</div>
                      <a href={activeRole === 'motoboy' ? '/motoboy/profile' : '/user-profile'} onClick={close} className={styles.item}>
                        <span className={styles.itemIcon}><Icon name="user" size={14} /></span> Meu Perfil
                      </a>
                      {activeRole !== 'lojista' && activeRole !== 'motoboy' && (
                        <a href="/editar-conta" onClick={close} className={styles.item}>
                          <span className={styles.itemIcon}><Icon name="settings" size={14} /></span> Editar meus dados
                        </a>
                      )}
                      <a href={activeRole === 'lojista' ? '/seller/wallet' : activeRole === 'motoboy' ? '/motoboy/wallet' : '/my-wallet'} onClick={close} className={styles.item}>
                        <span className={styles.itemIcon}><Icon name="wallet" size={14} /></span> Minha Carteira
                      </a>
                      {activeRole === 'cliente' && (
                        <a href="/user-dashboard" onClick={close} className={styles.item}>
                          <span className={styles.itemIcon}><Icon name="package" size={14} /></span> Meus Pedidos
                        </a>
                      )}
                      {activeRole === 'lojista' && (
                        hasStore ? (
                          <a href="/seller/dashboard" onClick={close} className={styles.item}><span className={styles.itemIcon}><Icon name="store" size={14} /></span> Meu Painel</a>
                        ) : (
                          <a href="/seller/create-store" onClick={close} className={`${styles.item} ${styles.itemPurple}`}><span className={styles.itemIcon}><Icon name="store" size={14} /></span> Criar Loja</a>
                        )
                      )}
                      {activeRole === 'motoboy' && (
                        <a href="/motoboy" onClick={close} className={styles.item}><span className={styles.itemIcon}><Icon name="motorcycle" size={14} /></span> Meu Painel</a>
                      )}
                      <a href="/suporte" onClick={close} className={styles.item}>
                        <span className={styles.itemIcon}><Icon name="headphones" size={14} /></span> Suporte
                      </a>
                    </div>

                    {/* Painel Admin (grid) */}
                    {isAdmin && (
                      <div className={styles.section}>
                        <div className={styles.sectionLabel}>Painel Admin</div>
                        <div className={styles.adminGrid}>
                          {adminItems.map(link => (
                            <a
                              key={link.href}
                              href={link.href}
                              onClick={close}
                              className={`${styles.adminCard} ${isActive(link.href) ? styles.adminCardActive : ''}`}
                            >
                              <span className={styles.adminCardIcon}><Icon name={link.icon} size={16} /></span>
                              <span className={styles.adminCardLabel}>{link.label}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Logout */}
                    <div className={styles.dropFoot}>
                      <button onClick={() => { close(); logout?.(); }} className={styles.logoutBtn}>
                        Sair da conta
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className={styles.loginLink}>Entrar</Link>
              <Link href="/register" className={styles.registerBtn}>Cadastrar</Link>
            </>
          )}
        </div>
      </nav>

    </header>

    {/* Menu fullscreen mobile — renderizado via portal fora do <header> para evitar
        o stacking context criado pelo backdrop-filter */}
    {mobileMenuOpen && typeof document !== 'undefined' && createPortal(
      <div className={styles.mobileOverlay}>
        <div className={styles.mobileOverlayHeader}>
          <Link href="/inicio" className={styles.logo} onClick={() => setMobileMenuOpen(false)}>
            <img src="/images/logog_png.png" alt="DROP" />
          </Link>
          <button className={styles.mobileClose} onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <nav aria-label="Navegação principal" className={styles.mobileNav}>
          <Link href="/" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="home" size={16} /> Produtos</Link>
          <Link href="/stores" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="store" size={16} /> Lojas</Link>
          {isAdmin && (
            <Link href={adminHome} className={`${styles.mobileNavLink} ${styles.mobileNavLinkAdmin}`} onClick={() => setMobileMenuOpen(false)}>
              <Icon name={meta.icon} size={16} /> Painel Admin
            </Link>
          )}
        </nav>

        {user && otherRoles.length > 0 && (
          <>
            <div className={styles.mobileSectionLabel}>Alternar para</div>
            <div className={styles.mobileRoleGrid}>
              {otherRoles.map((r: string) => {
                const m = ROLE_META[r] || { icon: 'user' as IconName, label: r };
                return (
                  <button
                    key={r}
                    className={styles.mobileRoleChip}
                    onClick={() => { switchRole?.(r); setMobileMenuOpen(false); router.push('/inicio'); }}
                  >
                    <Icon name={m.icon} size={14} /> {m.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {user ? (
          <>
            <div className={styles.mobileSectionLabel}>Conta</div>
            <nav aria-label="Conta" className={styles.mobileNav}>
              <a href={activeRole === 'motoboy' ? '/motoboy/profile' : '/user-profile'} className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="user" size={16} /> Meu Perfil</a>
              {activeRole !== 'lojista' && activeRole !== 'motoboy' && (
                <a href="/editar-conta" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="settings" size={16} /> Editar meus dados</a>
              )}
              <a href={activeRole === 'lojista' ? '/seller/wallet' : activeRole === 'motoboy' ? '/motoboy/wallet' : '/my-wallet'} className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="wallet" size={16} /> Minha Carteira</a>
              {activeRole === 'cliente' && (
                <a href="/user-dashboard" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="package" size={16} /> Meus Pedidos</a>
              )}
              {activeRole === 'lojista' && (
                hasStore ? (
                  <a href="/seller/dashboard" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="store" size={16} /> Meu Painel</a>
                ) : (
                  <a href="/seller/create-store" className={`${styles.mobileNavLink} ${styles.mobileNavLinkPurple}`} onClick={() => setMobileMenuOpen(false)}><Icon name="store" size={16} /> Criar Loja</a>
                )
              )}
              {activeRole === 'motoboy' && (
                <a href="/motoboy" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="motorcycle" size={16} /> Meu Painel</a>
              )}
              <a href="/suporte" className={styles.mobileNavLink} onClick={() => setMobileMenuOpen(false)}><Icon name="headphones" size={16} /> Suporte</a>
            </nav>
            <div className={styles.mobileFoot}>
              <button onClick={() => { setMobileMenuOpen(false); logout?.(); }} className={styles.mobileLogout}>
                Sair da conta
              </button>
            </div>
          </>
        ) : (
          <div className={styles.mobileFoot}>
            <Link href="/login" className={styles.mobileLoginBtn} onClick={() => setMobileMenuOpen(false)}>Entrar</Link>
            <Link href="/register" className={styles.mobileRegisterBtn} onClick={() => setMobileMenuOpen(false)}>Cadastrar</Link>
          </div>
        )}
      </div>,
      document.body
    )}
    </>
  );
}
