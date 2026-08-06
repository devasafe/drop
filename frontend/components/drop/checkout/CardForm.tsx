import { useEffect, useState } from 'react';
import { Input } from '../../ui/Input';
import { onlyDigits } from '../../../lib/masks';
import type { CardData, CardHolderInfo } from '../../../types/checkout';

// Luhn: valida o número do cartão (dígito verificador mod 10). Exige pelo
// menos 13 dígitos — abaixo disso não há bandeira válida.
function luhnValid(n: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return n.length >= 13 && sum % 10 === 0;
}

export interface CardPayload {
  card: CardData;
  cardHolder: CardHolderInfo;
  valid: boolean;
}

export interface CardFormProps {
  onChange: (payload: CardPayload) => void;
  holderDefaults: CardHolderInfo;
}

/**
 * Formulário de cartão de crédito (Fase 1, pagamento à vista). Controlado e
 * sem estado próprio de "titular" — `cardHolder` vem inteiro de
 * `holderDefaults` (nome/email/CPF/endereço já coletados no checkout), este
 * componente só cuida dos dados do cartão em si (número, nome impresso,
 * validade, CVV). Emite `{ card, cardHolder, valid }` a cada mudança via
 * `onChange`; `valid` reflete Luhn + validade (MM/AAAA) + CVV (3-4 dígitos).
 */
export function CardForm({ onChange, holderDefaults }: CardFormProps) {
  const [number, setNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [exp, setExp] = useState('');
  const [ccv, setCcv] = useState('');

  useEffect(() => {
    const num = onlyDigits(number);
    const [mm, yy] = exp.split('/');
    const year = yy ? (yy.length === 2 ? `20${yy}` : yy) : '';
    const valid =
      luhnValid(num) &&
      !!holderName.trim() &&
      /^(0[1-9]|1[0-2])$/.test(mm || '') &&
      /^\d{4}$/.test(year) &&
      /^\d{3,4}$/.test(ccv);

    onChange({
      valid,
      card: { holderName, number: num, expiryMonth: mm || '', expiryYear: year, ccv },
      cardHolder: holderDefaults,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, holderName, exp, ccv, holderDefaults]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Input
        aria-label="Número do cartão"
        placeholder="Número do cartão"
        inputMode="numeric"
        value={number}
        onChange={(v) => setNumber(onlyDigits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))}
      />
      <Input
        aria-label="Nome no cartão"
        placeholder="Nome como está no cartão"
        value={holderName}
        onChange={setHolderName}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <Input
          aria-label="Validade"
          placeholder="MM/AA"
          inputMode="numeric"
          value={exp}
          onChange={(v) => {
            const d = onlyDigits(v).slice(0, 4);
            setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
          }}
        />
        <Input
          aria-label="CVV"
          placeholder="CVV"
          inputMode="numeric"
          value={ccv}
          onChange={(v) => setCcv(onlyDigits(v).slice(0, 4))}
        />
      </div>
    </div>
  );
}
