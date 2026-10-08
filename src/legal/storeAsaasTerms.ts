/**
 * Termo de autorização do lojista para a DROP operar a conta Asaas dele (modo direto).
 * Rascunho operacional, sujeito a revisão jurídica. Trocar o texto EXIGE subir a versão:
 * cada aceite grava a versão que o lojista leu.
 */
export const STORE_ASAAS_TERMS_VERSION = '2026-10-08';

export const STORE_ASAAS_TERMS_TEXT = [
  'Autorizo a DROP a usar a chave de API da minha conta Asaas para, em meu nome:',
  '1. gerar cobranças Pix dos pedidos feitos na minha loja, recebidas diretamente na minha conta Asaas;',
  '2. estornar ao cliente, pela minha conta, o valor devido quando um pedido pago for cancelado, conforme as regras de cancelamento da DROP;',
  '3. transferir por Pix, da minha conta, a taxa de entrega devida ao motoboy que concluiu (ou teve direito a compensação em) cada entrega.',
  'O Pix é processado pelo Asaas Gestão Financeira Instituição de Pagamento S.A., instituição responsável pela minha conta.',
  'Posso revogar esta autorização a qualquer momento desconectando a conta ou revogando a chave no Asaas; pedidos em andamento continuam sendo finalizados.',
].join('\n');
