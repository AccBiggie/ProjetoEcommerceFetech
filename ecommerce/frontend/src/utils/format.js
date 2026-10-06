export const statusLabel = (status) =>
  ({
    Processing: "Em processamento",
    Shipped: "Enviado",
    Delivered: "Entregue",
    Pending: "Pendente",
  })[status] || status;
export const money = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
