import React, { useState, useEffect, useRef } from 'react';
import styles from './AddressSelector.module.css';
import Icon from './Icon';

interface AddressSelectorProps {
  mainAddress?: any;
  selectedAddress?: any;
  addresses: any[];
  onSelect: (address: any) => void;
  /**
   * Disparado quando o usuário pede para adicionar um novo endereço dentro do modal.
   * O parent é responsável por abrir o formulário (unificado com o checkout).
   */
  onRequestNewAddress?: () => void;
}

const compareAddresses = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  return (
    a.cep?.trim() === b.cep?.trim() &&
    a.street?.trim() === b.street?.trim() &&
    a.number?.trim() === b.number?.trim()
  );
};

export const AddressSelector: React.FC<AddressSelectorProps> = ({
  mainAddress,
  selectedAddress,
  addresses,
  onSelect,
  onRequestNewAddress,
}) => {
  const [selectedAddr, setSelectedAddr] = useState<any>(selectedAddress || mainAddress || null);
  const [showModal, setShowModal] = useState(false);
  const initializedRef = useRef(false);

  // Auto-seleciona mainAddress na primeira vez que estiver disponível
  useEffect(() => {
    if (mainAddress && mainAddress.street && mainAddress.latitude && !initializedRef.current) {
      initializedRef.current = true;
      setSelectedAddr(mainAddress);
      onSelect(mainAddress);
    }
  }, [mainAddress, onSelect]);

  // Sincroniza com selectedAddress externo
  useEffect(() => {
    if (selectedAddress && selectedAddress.street && initializedRef.current) {
      setSelectedAddr(selectedAddress);
    }
  }, [selectedAddress]);

  const handleSelectAddress = (addr: any) => {
    setSelectedAddr(addr);
    onSelect(addr);
    setTimeout(() => setShowModal(false), 250);
  };

  const handleRequestNew = () => {
    setShowModal(false);
    if (onRequestNewAddress) onRequestNewAddress();
  };

  const isDefaultAddress = compareAddresses(selectedAddr, mainAddress);

  return (
    <div>
      {selectedAddr && (
        <div className={styles.selectedCard}>
          <div className={styles.selectedInfo}>
            <div className={styles.selectedHeader}>
              <span className={styles.selectedTitle}>✓ Endereço Selecionado</span>
              {isDefaultAddress && <span className={styles.defaultBadge}><Icon name="star" size={12} /> Padrão</span>}
            </div>
            {selectedAddr.label && (
              <div className={styles.selectedLabel}>{selectedAddr.label}</div>
            )}
            <div className={styles.selectedAddress}>
              {selectedAddr.street}, {selectedAddr.number}
              {selectedAddr.complement && ` - ${selectedAddr.complement}`}
              <br />
              {selectedAddr.neighborhood}, {selectedAddr.city} - {selectedAddr.state}
              {(selectedAddr.cep || selectedAddr.zip) && `, ${selectedAddr.cep || selectedAddr.zip}`}
            </div>
          </div>
          <button type="button" className={styles.btnAlterar} onClick={() => setShowModal(true)}>
            <Icon name="map-pin" size={14} /> Alterar
          </button>
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}><Icon name="map-pin" size={16} /> Selecionar Endereço</h3>
              <button type="button" className={styles.btnClose} onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>

            {addresses.length > 0 ? (
              <>
                <p className={styles.listLabel}>Meus endereços salvos</p>
                <ul className={styles.list}>
                  {addresses.map((addr, idx) => {
                    const isMainAddr = compareAddresses(addr, mainAddress);
                    const isSelected = compareAddresses(addr, selectedAddr);
                    return (
                      <li key={idx}>
                        <button
                          type="button"
                          className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                          onClick={() => handleSelectAddress(addr)}
                        >
                          <div className={styles.itemMain}>
                            <div className={styles.itemLabel}>{addr.label || 'Sem rótulo'}</div>
                            <div className={styles.itemAddress}>
                              {addr.street}, {addr.number}
                              {addr.complement && ` - ${addr.complement}`}
                              <br />
                              {addr.neighborhood}, {addr.city} - {addr.state}
                            </div>
                          </div>
                          <div className={styles.itemMeta}>
                            {isMainAddr && <span className={styles.defaultBadge}><Icon name="star" size={12} /> Padrão</span>}
                            {isSelected && <span className={styles.checkMark}>✓ Selecionado</span>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className={styles.empty}>Nenhum endereço salvo ainda.</p>
            )}

            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>
                Fechar
              </button>
              <button type="button" className={styles.btnPrimary} onClick={handleRequestNew}>
                <Icon name="plus" size={14} /> Novo Endereço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
