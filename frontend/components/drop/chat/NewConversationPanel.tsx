import styles from './NewConversationPanel.module.css';
import Icon from '../../Icon';
import { Button } from '../../ui/Button';
import { SearchField } from '../../ui/SearchField';
import { EmptyState } from '../../ui/EmptyState';

export interface NewConversationPanelProps {
  contacts: any[];
  stores: any[];
  search: string;
  onSearch: (s: string) => void;
  loading: boolean;
  onPick: (contact: any) => void;
  onBack: () => void;
}

function roleLabel(role?: string) {
  if (role === 'lojista') return 'Loja';
  if (role === 'motoboy') return 'Motoboy';
  return 'Cliente';
}

/**
 * Painel de "nova conversa" do widget de chat: busca + listas de contatos
 * (participantes de entregas/pedidos ativos) e lojas (papel cliente), com
 * botão de voltar para a lista de conversas. `contacts` e `stores` chegam do
 * container já carregados por papel — o container só popula a lista
 * relevante para o papel ativo, a outra fica vazia — então este componente
 * só renderiza a(s) seção(ões) com itens.
 */
export function NewConversationPanel({
  contacts,
  stores,
  search,
  onSearch,
  loading,
  onPick,
  onBack,
}: NewConversationPanelProps) {
  const term = search.trim().toLowerCase();
  const filteredStores = stores
    .filter((s) => (s.name || '').toLowerCase().includes(term))
    .slice(0, 40);
  const filteredContacts = contacts.filter((c) => (c.name || '').toLowerCase().includes(term));

  return (
    <div className={styles.wrapper}>
      <Button
        variant="ghost"
        size="sm"
        className={styles.backButton}
        leftIcon={<Icon name="arrow-left" size={16} />}
        onClick={onBack}
      >
        Conversas
      </Button>
      <SearchField
        value={search}
        onChange={onSearch}
        placeholder="Buscar contato ou loja..."
      />
      <div className={styles.body}>
        {loading ? (
          <div className={styles.status}>
            <span className={styles.spinner} />
            Carregando...
          </div>
        ) : (
          <>
            {filteredStores.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Lojas</div>
                {filteredStores.map((s) => (
                  <div key={s._id || s.id} className={styles.item} onClick={() => onPick(s)}>
                    <div className={styles.name}>{s.name}</div>
                  </div>
                ))}
              </div>
            )}
            {filteredContacts.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Contatos</div>
                {filteredContacts.map((c) => (
                  <div key={c.id || c._id} className={styles.item} onClick={() => onPick(c)}>
                    <div className={styles.name}>{c.name}</div>
                    <div className={styles.meta}>
                      {[c.context, roleLabel(c.role)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {stores.length === 0 && contacts.length === 0 && (
              <EmptyState
                icon={<Icon name="users" size={28} />}
                title="Nenhum contato ou loja disponível"
                description="Aparecem os participantes das entregas/pedidos ativos ou as lojas para conversar."
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
