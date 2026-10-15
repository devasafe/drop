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

/** Dúvidas do motoboy: as regras reais (CLAUDE.md, "Pedido e despacho") e onde a informação aparece no painel. */
export const MOTOBOY_HELP_FAQ: { q: string; a: string }[] = [
  { q: 'Como funciona uma corrida?', a: 'A oferta aparece em Corridas. Você aceita, vai até a loja e mostra o código de retirada de 5 números. A loja digita o código, e aí você leva ao cliente. Para finalizar, digite o código de 5 números que o cliente te diz.' },
  { q: 'Quando recebo pelas entregas?', a: 'Depende de como a DROP está operando. Com saldo na DROP, cada entrega vira um valor a liberar em Ganhos e, depois de liberado, você saca no Pix. Com repasse direto, a loja manda o Pix para a sua chave quando a entrega é concluída. A aba Ganhos mostra qual é o seu caso.' },
  { q: 'O cliente não atende. E agora?', a: 'Tente ligar e mandar mensagem pela corrida. Depois da espera mínima que aparece na tela, contada da retirada, o botão "Encerrar como ausente" libera e você devolve o pacote na loja com o código de devolução.' },
  { q: 'Por que minha verificação foi recusada?', a: 'O motivo aparece em Perfil, em Verificação. Toque em "Refazer" e envie a foto de novo, nítida e sem reflexo.' },
];
