import { humanizeTransferError } from '../lib/transferErrors';
import { humanizeRefundError } from '../lib/refundErrors';

const PERMISSION = 'insufficient_permission: A chave de API fornecida não possui permissão para realizar operações de saque via API.';

test('chave sem permissão de Transferências não aparece como falta de saldo', () => {
  expect(humanizeTransferError(PERMISSION)).toBe('A chave de API da loja não tem a permissão de Transferências no Asaas');
  expect(humanizeRefundError(PERMISSION)).toBe('A chave de API da loja não tem a permissão necessária no Asaas');
});

test('saldo insuficiente continua como saldo', () => {
  expect(humanizeTransferError('insufficient_balance: Saldo insuficiente')).toBe('A loja não tem saldo no Asaas para esta transferência');
});
