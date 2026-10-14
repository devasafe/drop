/** Dúvidas comuns com as regras reais do DROP (CLAUDE.md, "Dinheiro" e "Pedido e despacho"). */
export const HELP_FAQ: { q: string; a: string }[] = [
  { q: 'Quando meu estorno cai?', a: 'No Pix, o dinheiro volta para a conta que pagou em até 1 dia útil. No cartão, o estorno aparece na fatura conforme o prazo do seu banco.' },
  { q: 'Como funciona o código de entrega?', a: 'É um código de 5 números que aparece no seu pedido. Compartilhe com o motoboy quando receber o pacote: ele só conclui a entrega com o código.' },
  { q: 'Por que paguei taxa de cancelamento?', a: 'Cancelar é grátis até o motoboy retirar o pedido. Depois disso, o valor da entrega fica com o motoboy, que já fez a viagem, e o resto volta para você.' },
];

/** Dúvidas do lojista: só apontam para onde o painel já mostra a informação. */
export const SELLER_HELP_FAQ: { q: string; a: string }[] = [
  { q: 'Onde vejo o que tenho a receber?', a: 'Na aba Dinheiro. O valor de cada pedido aparece como a receber e é liberado depois da entrega.' },
  { q: 'O motoboy não conseguiu entregar. E agora?', a: 'O pedido aparece na aba Pedidos, em Devoluções, enquanto o motoboy volta com o produto. Quando ele chegar, confira o pacote e digite o PIN que ele mostrar para confirmar o recebimento.' },
  { q: 'Como troco de plano ou de comissão?', a: 'Na aba Loja, em Plano e comissão. Você compara as opções e pede a troca por lá.' },
];
