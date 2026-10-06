import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Link as MuiLink,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";

import Loader from "../layout/Loader/Loader";
import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useParams } from "react-router";
import Page from "../layout/Page";
import { getErrorMessage } from "../../utils/api";
import { statusLabel, money } from "../../utils/format";

export default function OrderDetails() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    axios
      .get(`/api/v1/order/${id}`, { signal: controller.signal })
      .then(({ data }) => setState({ order: data.order }))
      .catch((error) => {
        if (!axios.isCancel(error)) setState({ error: getErrorMessage(error) });
      });
    return () => controller.abort();
  }, [id]);
  const order = state.order;
  return (
    <Page
      title="Detalhes do pedido"
      actions={
        <Button component={Link} to="/orders" variant="outlined">
          Meus pedidos
        </Button>
      }
    >
      {state.loading && <Loader />}
      {state.error && <Alert severity="error">{state.error}</Alert>}
      {order && (
        <Stack spacing={3}>
          <Card sx={{ p: 3 }}>
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ overflowWrap: "anywhere", mb: 3 }}
            >
              Pedido: {order._id}
            </Typography>
            <Stepper
              alternativeLabel
              activeStep={["Processing", "Shipped", "Delivered"].indexOf(
                order.orderStatus,
              )}
            >
              {["Em processamento", "Enviado", "Entregue"].map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
            <Chip
              label={"Pagamento: " + statusLabel(order.paymentInfo.status)}
              variant="outlined"
              sx={{ mt: 3 }}
            />
          </Card>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
              gap: 3,
            }}
          >
            <Card sx={{ p: 3 }}>
              <Typography variant="h2">Produtos</Typography>
              <Stack divider={<Divider />} sx={{ mt: 2 }}>
                {order.orderItems.map((item) => (
                  <Stack
                    key={item._id}
                    direction="row"
                    spacing={2}
                    sx={{ py: 2, alignItems: "center" }}
                  >
                    <Box
                      component="img"
                      src={item.image || "/Profile.png"}
                      alt=""
                      sx={{ width: 56, height: 56, objectFit: "contain" }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <MuiLink
                        component={Link}
                        to={"/product/" + item.product}
                        underline="hover"
                      >
                        {item.name}
                      </MuiLink>
                      <Typography variant="body2" color="textSecondary">
                        {item.quantity} × {money(item.price)}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
              <Divider />
              <Stack
                direction="row"
                sx={{ mt: 3, justifyContent: "space-between" }}
              >
                <Typography sx={{ fontWeight: 700 }}>Total</Typography>
                <Typography variant="h2">{money(order.totalPrice)}</Typography>
              </Stack>
            </Card>
            <Card sx={{ p: 3, alignSelf: "start" }}>
              <Typography variant="h2" sx={{ mb: 2 }}>
                Entrega
              </Typography>
              <Typography>{order.shippingInfo.address}</Typography>
              <Typography color="textSecondary">
                {order.shippingInfo.city} — {order.shippingInfo.state}
              </Typography>
              <Typography color="textSecondary">
                CEP {order.shippingInfo.pinCode}
              </Typography>
            </Card>
          </Box>
        </Stack>
      )}
    </Page>
  );
}
