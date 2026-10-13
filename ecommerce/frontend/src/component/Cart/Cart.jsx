import { cartTotalCents, multiplyCents } from '../../utils/money';
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router";
import { Alert, Box, Button, Card, Divider, Stack, Typography } from "@mui/material";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import { addItemsToCart, removeItemsFromCart } from "../../actions/cartAction";
import { useAlert } from "../../utils/alerts";
import { getErrorMessage } from "../../utils/api";
import { money } from "../../utils/format";
import Page from "../layout/Page";
import CartItemCard from "./CartItemCard";
import QuantityControl from "../layout/QuantityControl";

export default function Cart() {
  const navigate = useNavigate(),
    alert = useAlert(),
    dispatch = useDispatch();
  const { cartItems } = useSelector((state) => state.cart);
  const [pending, setPending] = useState("");
  const change = async (item, quantity) => {
    if (pending || quantity < 1 || quantity > item.stock) return;
    setPending(item.product);
    try {
      await dispatch(addItemsToCart(item.product, quantity));
    } catch (error) {
      alert.error(getErrorMessage(error));
    } finally {
      setPending("");
    }
  };
  const invalidMoney = cartItems.some(item => item.moneyInvalid);
  let total = 0, moneyError = invalidMoney;
  try { if (!invalidMoney) total = cartTotalCents(cartItems); } catch { moneyError = true; }
  return (
    <Page
      title="Carrinho"
      subtitle="Revise seus produtos antes de finalizar o pedido."
    >
      {moneyError && <Alert severity="error">Há valores inválidos no carrinho. Remova ou atualize os itens antes de continuar.</Alert>}
      {!cartItems.length ? (
        <Card sx={{ py: 7, textAlign: "center" }}>
          <ShoppingBagOutlined sx={{ fontSize: 56, color: "text.disabled" }} />
          <Typography variant="h2" sx={{ mt: 2, mb: 3 }}>
            Sem produtos no carrinho.
          </Typography>
          <Button component={Link} to="/products" variant="contained">
            Explorar produtos
          </Button>
        </Card>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 320px" },
            gap: 3,
            alignItems: "start",
          }}
        >
          <Stack spacing={2}>
            {cartItems.map((item) => (
              <Card
                className="cartContainer"
                key={item.product}
                sx={{ p: 2.5 }}
              >
                <CartItemCard
                  item={item}
                  disabled={Boolean(pending)}
                  deleteCartItems={(id) => {
                    dispatch(removeItemsFromCart(id));
                    requestAnimationFrame(() => document.querySelector('main h1')?.focus());
                  }}
                />
                <Stack
                  direction="row"
                  sx={{
                    mt: 2,
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <QuantityControl
                    productName={item.name}
                    value={item.quantity}
                    stock={item.stock}
                    disabled={Boolean(pending) || moneyError}
                    onDecrease={() => change(item, item.quantity - 1)}
                    onIncrease={() => change(item, item.quantity + 1)}
                  />
                  <Typography sx={{ fontWeight: 700 }}>
                    {item.moneyInvalid ? "Preço inválido" : money(multiplyCents(item.priceCents, item.quantity))}
                  </Typography>
                </Stack>
              </Card>
            ))}
          </Stack>
          <Card component="section" aria-labelledby="cart-summary-title" sx={{ p: 3, position: { md: "sticky" }, top: 160 }}>
            <Typography id="cart-summary-title" variant="h2">Resumo do pedido</Typography>
            <Stack
              direction="row"
              sx={{ my: 3, justifyContent: "space-between" }}
            >
              <Typography color="textSecondary">Produtos</Typography>
              <Typography role="status">
                {cartItems.reduce((sum, item) => sum + item.quantity, 0)} itens
              </Typography>
            </Stack>
            <Divider />
            <Stack
              direction="row"
              sx={{ my: 3, justifyContent: "space-between" }}
            >
              <Typography sx={{ fontWeight: 700 }}>Total</Typography>
              <Typography component="p" variant="h2">{moneyError ? "Total indisponível" : money(total)}</Typography>
            </Stack>
            <Button
              fullWidth
              variant="contained"
              disabled={Boolean(pending) || moneyError}
              onClick={() => navigate("/shipping")}
            >
              Finalizar pedido
            </Button>
            <Button fullWidth component={Link} to="/products" sx={{ mt: 1 }}>
              Continuar comprando
            </Button>
          </Card>
        </Box>
      )}
    </Page>
  );
}
