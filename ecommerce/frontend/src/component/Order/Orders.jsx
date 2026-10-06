import {
  Alert,
  Button,
  Card,
  Chip,
  Link as MuiLink,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";
import DataTable from "../layout/DataTable";
import Loader from "../layout/Loader/Loader";
import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router";
import Page from "../layout/Page";
import { getErrorMessage } from "../../utils/api";

import { statusLabel, money } from "../../utils/format";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    axios
      .get("/api/v1/orders/me", { signal: controller.signal })
      .then(({ data }) => setOrders(data.orders))
      .catch((error) => {
        if (!axios.isCancel(error)) setError(getErrorMessage(error));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
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
        <DataTable label="Meus pedidos" columns={["Pedido", "Status", "Total"]}>
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
              <TableCell>{money(order.totalPrice)}</TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
      <Button component={Link} to="/products" sx={{ mt: 2 }}>
        Continuar comprando
      </Button>
    </Page>
  );
}
