import {
  Alert,
  Box,
  Button,
  Card,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import { useState, useRef } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { Navigate } from "react-router";
import Page from "../layout/Page";
import { saveShippingInfo } from "../../actions/cartAction";
import { CLEAR_CART } from "../../constants/cartConstants";
import { getErrorMessage } from "../../utils/api";
import { money } from "../../utils/format";

export default function Shipping() {
  const { cartItems, shippingInfo } = useSelector((state) => state.cart);
  const [shipping, setShipping] = useState({
    address: "",
    city: "",
    state: "",
    country: "Brasil",
    pinCode: "",
    phoneNo: "",
    ...shippingInfo,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useDispatch();
  const completedOrder = useRef(null);
  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await dispatch(saveShippingInfo(shipping));
      const { data } = await axios.post("/api/v1/order/new", {
        shippingInfo: shipping,
        orderItems: cartItems.map((item) => ({
          product: item.product,
          quantity: item.quantity,
        })),
      });
      completedOrder.current = data.order._id;
      dispatch({ type: CLEAR_CART });
      localStorage.removeItem("cartItems");
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  };
  if (completedOrder.current)
    return <Navigate to={`/order/${completedOrder.current}`} replace />;
  if (!cartItems.length) return <Navigate to="/cart" replace />;
  return (
    <Page
      title="Finalizar pedido"
      subtitle="Informe onde você quer receber seus produtos."
    >
      <Stepper activeStep={1} sx={{ mb: 4, maxWidth: 500 }}>
        {["Carrinho", "Entrega"].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 320px" },
          gap: 3,
          alignItems: "start",
        }}
      >
        <Card component="form" onSubmit={submit} sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h2" sx={{ mb: 3 }}>
            Endereço de entrega
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
              gap: 2.5,
            }}
          >
            {[
              ["address", "Endereço", "street-address"],
              ["city", "Cidade", "address-level2"],
              ["state", "Estado", "address-level1"],
              ["country", "País", "country-name"],
              ["pinCode", "CEP", "postal-code"],
              ["phoneNo", "Telefone", "tel"],
            ].map(([key, label, autoComplete]) => (
              <TextField
                key={key}
                label={label}
                name={key}
                value={shipping[key]}
                required
                autoComplete={autoComplete}
                sx={{ gridColumn: key === "address" ? "1 / -1" : undefined }}
                slotProps={{
                  htmlInput: {
                    inputMode: ["pinCode", "phoneNo"].includes(key)
                      ? "numeric"
                      : undefined,
                    pattern: ["pinCode", "phoneNo"].includes(key)
                      ? "[0-9]+"
                      : undefined,
                  },
                }}
                onChange={(e) =>
                  setShipping({ ...shipping, [key]: e.target.value })
                }
              />
            ))}
          </Box>
          <Button
            variant="contained"
            type="submit"
            disabled={pending}
            sx={{ mt: 3 }}
          >
            {pending ? "Criando pedido..." : "Criar pedido"}
          </Button>
        </Card>
        <Card sx={{ p: 3 }}>
          <Typography variant="h2">Resumo</Typography>
          <Typography variant="h2" sx={{ my: 3 }}>
            {money(
              cartItems.reduce(
                (sum, item) => sum + Number(item.price) * item.quantity,
                0,
              ),
            )}
          </Typography>
          <Alert severity="info">
            O pedido será registrado com pagamento pendente. Não será efetuada
            cobrança nesta etapa.
          </Alert>
        </Card>
      </Box>
    </Page>
  );
}
