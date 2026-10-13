// Rota antiga: o redirect (/seller/order-:id → /seller/pedido/:id) fica em lib/redirects.js (P5).
// O arquivo continua como re-export porque o teste intocável seller-order-refund importa este caminho.
export { default } from './pedido/[id]';
