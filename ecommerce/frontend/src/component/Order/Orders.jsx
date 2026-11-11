import {
  Alert,
  Button,
  Card,
  Chip,
  Link as MuiLink,
  TableCell,
  TableRow,
  Typography,
  Pagination,
} from "@mui/material";
import DataTable from "../layout/DataTable";
import Loader from "../layout/Loader/Loader";
import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router";
import Page from "../layout/Page";
import { getErrorMessage } from "../../utils/api";

import { statusLabel, money, paymentLabel } from "../../utils/format";
import CancelOrder from './CancelOrder';
import { useRef } from 'react';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const cancelled = useRef(new Map());
  const onCancelled = order => { cancelled.current.set(order._id, order); setOrders(items => items.map(item => item._id === order._id ? { ...item, ...order } : item)); };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    axios
      .get("/api/v1/orders/me", { signal: controller.signal, params: { page, limit: 25 } })
      .then(({ data }) => { if (!controller.signal.aborted) { setOrders(data.orders.map(order => cancelled.current.get(order._id) || order)); setPagination(data.pagination); } })
      .catch((error) => {
        if (!axios.isCancel(error)) setError(getErrorMessage(error));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);
  return (
    <Page
      title="Meus pedidos"
      subtitle="Acompanhe o andamento das suas compras."
    >
      {loading && <Loader />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && !orders.length && (
        <Card sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            Você ainda não possui pedidos.
          </Typography>
          <Button component={Link} to="/products" variant="contained">
            Explorar produtos
          </Button>
        </Card>
      )}
      {!!orders.length && (
        <DataTable label="Meus pedidos" columns={["Pedido", "Status", "Pagamento", "Total", "Ações"]}>
          {orders.map((order) => (
            <TableRow key={order._id} hover>
              <TableCell>
                <MuiLink
                  component={Link}
                  to={"/order/" + order._id}
                  underline="hover"
                >
                  {order._id}
                </MuiLink>
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  variant="outlined"
                  label={statusLabel(order.orderStatus)}
                  color={
                    order.orderStatus === "Delivered" ? "success" : "default"
                  }
                />
              </TableCell>
              <TableCell><Chip size="small" label={"Pagamento: " + paymentLabel(order)} /></TableCell>
              <TableCell>{money(order.totalPriceCents)}</TableCell>
              <TableCell><CancelOrder order={order} onCancelled={onCancelled} /></TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
      {pagination?.pages > 1 && <Pagination aria-label="Paginação dos meus pedidos" sx={{ mt: 3 }} count={pagination.pages} page={page} disabled={loading} onChange={(_, value) => setPage(value)} />}
      <Button component={Link} to="/products" sx={{ mt: 2 }}>
        Continuar comprando
      </Button>
    </Page>
  );
}
