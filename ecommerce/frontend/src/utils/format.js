export const statusLabel = (status) =>
  ({
    Processing: "Em processamento",
    Shipped: "Enviado",
    Delivered: "Entregue",
    Pending: "Pendente",
  })[status] || status;
export { formatBRLFromCents as money } from '../../../shared/money.mjs';
