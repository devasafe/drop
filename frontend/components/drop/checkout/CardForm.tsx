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

// Mesmos regexes do backend (validation/schemas.ts:94/97) — validar aqui
// também evita mandar o usuário pro POST /orders só pra descobrir, via 400,
// que faltava CPF/telefone.
const CPF_CNPJ_RE = /^\d{11}$|^\d{14}$/;
const PHONE_RE = /^\d{10,11}$/;

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
 * Formulário de cartão de crédito (Fase 1, pagamento à vista). Controlado.
 * `name`/`email`/`postalCode`/`addressNumber` do titular vêm prontos de
 * `holderDefaults` (usuário logado + endereço de entrega já selecionado no
 * checkout — sempre presentes nesse ponto do fluxo). `cpfCnpj`/`phone` são
 * DIFERENTES: `holderDefaults` só traz um prefill best-effort (de
 * `GET /user/me`, que pode não ter esses campos preenchidos no perfil do
 * usuário) — por isso viram inputs próprios aqui, editáveis, com o prefill
 * sincronizado assim que `holderDefaults` chega (útil pois a busca de
 * `/user/me` é assíncrona e normalmente resolve depois do primeiro render).
 * Sem isso, um perfil sem CPF/telefone cadastrado travaria QUALQUER compra
 * de cartão com 400 do backend (Zod exige `cpfCnpj` 11/14 dígitos e `phone`
 * 10/11 dígitos — ver validation/schemas.ts) sem o usuário ter como corrigir.
 *
 * Emite `{ card, cardHolder, valid }` a cada mudança via `onChange`; `valid`
 * exige Luhn + nome + validade (MM/AAAA) + CVV (3-4 dígitos) E cpfCnpj/phone
 * nos formatos aceitos pelo backend — só assim o botão de confirmar libera.
 */
export function CardForm({ onChange, holderDefaults }: CardFormProps) {
  const [number, setNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [exp, setExp] = useState('');
  const [ccv, setCcv] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState(holderDefaults.cpfCnpj || '');
  const [phone, setPhone] = useState(holderDefaults.phone || '');

  // Prefill assíncrono: só preenche se o campo ainda estiver vazio, pra
  // nunca sobrescrever o que o usuário já digitou.
  useEffect(() => {
    if (holderDefaults.cpfCnpj) setCpfCnpj((prev) => prev || holderDefaults.cpfCnpj);
  }, [holderDefaults.cpfCnpj]);
  useEffect(() => {
    if (holderDefaults.phone) setPhone((prev) => prev || holderDefaults.phone);
  }, [holderDefaults.phone]);

  useEffect(() => {
    const num = onlyDigits(number);
    const [mm, yy] = exp.split('/');
    const year = yy ? (yy.length === 2 ? `20${yy}` : yy) : '';
    const valid =
      luhnValid(num) &&
      !!holderName.trim() &&
      /^(0[1-9]|1[0-2])$/.test(mm || '') &&
      /^\d{4}$/.test(year) &&
      /^\d{3,4}$/.test(ccv) &&
      CPF_CNPJ_RE.test(cpfCnpj) &&
      PHONE_RE.test(phone);

    onChange({
      valid,
      card: { holderName, number: num, expiryMonth: mm || '', expiryYear: year, ccv },
      cardHolder: { ...holderDefaults, cpfCnpj, phone },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, holderName, exp, ccv, cpfCnpj, phone, holderDefaults]);

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
      <div style={{ display: 'flex', gap: 10 }}>
        <Input
          aria-label="CPF ou CNPJ do titular"
          placeholder="CPF/CNPJ do titular"
          inputMode="numeric"
          value={cpfCnpj}
          onChange={(v) => setCpfCnpj(onlyDigits(v).slice(0, 14))}
        />
        <Input
          aria-label="Telefone do titular"
          placeholder="Telefone do titular"
          inputMode="numeric"
          value={phone}
          onChange={(v) => setPhone(onlyDigits(v).slice(0, 11))}
        />
      </div>
    </div>
  );
}
