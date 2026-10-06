import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Link as MuiLink,
  Stack,
  Tab,
  TableCell,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DataTable from "../layout/DataTable";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router";
import { useSelector } from "react-redux";
import Page from "../layout/Page";
import categories from "../../data/categories.json";
import { getErrorMessage } from "../../utils/api";
import { money, statusLabel } from "../../utils/format";

const emptyProduct = () => ({
  name: "",
  description: "",
  category: categories[0],
  price: "",
  oldPrice: "",
  Stock: 10,
  imageUrl: "/demo-products/ProjetoLogoFetech2.svg",
});
export default function Dashboard() {
  const { user } = useSelector((state) => state.user);
  const [confirmation, setConfirmation] = useState(null);
  const [tab, setTab] = useState("products");
  const [data, setData] = useState({ products: [], users: [], orders: [] });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState(emptyProduct);
  const load = useCallback(async () => {
    const [products, users, orders] = await Promise.all([
      axios.get("/api/v1/admin/products"),
      axios.get("/api/v1/admin/users"),
      axios.get("/api/v1/admin/orders"),
    ]);
    setData({
      products: products.data.products,
      users: users.data.users,
      orders: orders.data.orders,
    });
  }, []);
  useEffect(() => {
    load().catch((error) => setError(getErrorMessage(error)));
  }, [load]);
  const mutate = async (action) => {
    setError("");
    setPending(true);
    try {
      await action();
      await load();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const saveProduct = (event) => {
    event.preventDefault();
    const price = Number(draft.price),
      oldPrice = Number(draft.oldPrice || draft.price);
    const payload = {
      name: draft.name,
      description: draft.description,
      category: draft.category,
      price: price.toFixed(2),
      oldPrice: oldPrice.toFixed(2),
      Stock: Number(draft.Stock),
      off: Math.max(0, Math.round((1 - price / oldPrice) * 100)),
      installmmentPrice: (price / 12).toFixed(2),
      countDown:
        draft.countDown || new Date(Date.now() + 30 * 86400000).toISOString(),
      images: [
        {
          public_id: draft.images?.[0]?.public_id || "catalog-image",
          url: draft.imageUrl,
          banner: draft.imageUrl,
        },
      ],
    };
    mutate(async () => {
      if (draft._id) await axios.put(`/api/v1/product/${draft._id}`, payload);
      else await axios.post("/api/v1/product/new", payload);
      setDraft(emptyProduct());
    });
  };
  return (
    <Page
      title="Painel administrativo"
      subtitle="Gerencie o catálogo, os clientes e os pedidos da loja."
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        {[
          ["Produtos", data.products.length],
          ["Usuários", data.users.length],
          ["Pedidos", data.orders.length],
        ].map(([label, value]) => (
          <Card key={label} sx={{ p: 3 }}>
            <Typography color="textSecondary">{label}</Typography>
            <Typography variant="h1" sx={{ mt: 1 }}>
              {value}
            </Typography>
          </Card>
        ))}
      </Box>
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        aria-label="Administração"
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3 }}
      >
        {[
          ["products", "Produtos"],
          ["users", "Usuários"],
          ["orders", "Pedidos"],
        ].map(([value, label]) => (
          <Tab key={value} value={value} label={label} />
        ))}
      </Tabs>
      {pending && <LinearProgress sx={{ mb: 2 }} />}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {tab === "products" && (
        <>
          <Card
            component="form"
            onSubmit={saveProduct}
            sx={{ p: { xs: 2.5, md: 3 } }}
          >
            <Typography variant="h2" sx={{ mb: 3 }}>
              {draft._id ? "Editar produto" : "Novo produto"}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
                gap: 2.5,
              }}
            >
              {[
                ["name", "Nome"],
                ["description", "Descrição"],
                ["price", "Preço"],
                ["oldPrice", "Preço anterior"],
                ["Stock", "Estoque"],
                ["imageUrl", "URL da imagem"],
              ].map(([key, label]) => (
                <TextField
                  key={key}
                  label={label}
                  required={key !== "oldPrice"}
                  multiline={key === "description"}
                  type={
                    ["price", "oldPrice", "Stock"].includes(key)
                      ? "number"
                      : "text"
                  }
                  value={draft[key]}
                  slotProps={{
                    htmlInput: {
                      min: key === "Stock" ? 0 : 0.01,
                      step: key === "Stock" ? 1 : 0.01,
                    },
                  }}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              ))}
              <TextField
                select
                label="Categoria"
                value={draft.category}
                slotProps={{ select: { native: true } }}
                onChange={(event) =>
                  setDraft({ ...draft, category: event.target.value })
                }
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </TextField>
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
              <Button type="submit" variant="contained" disabled={pending}>
                Salvar produto
              </Button>
              {draft._id && (
                <Button onClick={() => setDraft(emptyProduct())}>
                  Cancelar edição
                </Button>
              )}
            </Stack>
          </Card>
          <DataTable
            label="Produtos cadastrados"
            columns={["Produto", "Categoria", "Preço", "Ações"]}
          >
            {data.products.map((product) => (
              <TableRow key={product._id} hover>
                <TableCell>
                  <MuiLink
                    component={Link}
                    to={"/product/" + product._id}
                    underline="hover"
                  >
                    {product.name}
                  </MuiLink>
                </TableCell>
                <TableCell>{product.category}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {money(product.price)}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      disabled={pending}
                      onClick={() =>
                        setDraft({
                          ...product,
                          imageUrl: product.images[0]?.url || "/Profile.png",
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      disabled={pending}
                      onClick={() =>
                        setConfirmation({
                          title: "Excluir este produto?",
                          action: () =>
                            axios.delete("/api/v1/product/" + product._id),
                        })
                      }
                    >
                      Excluir
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        </>
      )}
      {tab === "users" && (
        <DataTable
          label="Usuários cadastrados"
          columns={["Nome", "E-mail", "Perfil", "Ações"]}
        >
          {data.users.map((account) => (
            <TableRow key={account._id} hover>
              <TableCell>{account.name}</TableCell>
              <TableCell>{account.email}</TableCell>
              <TableCell>
                <TextField
                  select
                  size="small"
                  value={account.role}
                  disabled={pending || account._id === user._id}
                  slotProps={{
                    select: { native: true },
                    htmlInput: { "aria-label": "Perfil de " + account.email },
                  }}
                  onChange={(event) =>
                    mutate(() =>
                      axios.put("/api/v1/admin/user/" + account._id, {
                        role: event.target.value,
                      }),
                    )
                  }
                >
                  <option value="user">Cliente</option>
                  <option value="admin">Administrador</option>
                </TextField>
              </TableCell>
              <TableCell>
                <Button
                  color="error"
                  disabled={pending || account._id === user._id}
                  onClick={() =>
                    setConfirmation({
                      title: "Excluir este usuário?",
                      action: () =>
                        axios.delete("/api/v1/admin/user/" + account._id),
                    })
                  }
                >
                  Excluir
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
      {tab === "orders" && (
        <DataTable
          label="Pedidos da loja"
          columns={["Pedido", "Status", "Total", "Ações"]}
        >
          {data.orders.map((order) => (
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
                  label={statusLabel(order.orderStatus)}
                  color={
                    order.orderStatus === "Delivered" ? "success" : "default"
                  }
                />
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {money(order.totalPrice)}
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={1}>
                  {order.orderStatus !== "Delivered" && (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        mutate(() =>
                          axios.put("/api/v1/admin/order/" + order._id, {
                            status:
                              order.orderStatus === "Processing"
                                ? "Shipped"
                                : "Delivered",
                          }),
                        )
                      }
                    >
                      {order.orderStatus === "Processing"
                        ? "Marcar enviado"
                        : "Marcar entregue"}
                    </Button>
                  )}
                  <Button
                    color="error"
                    disabled={pending}
                    onClick={() =>
                      setConfirmation({
                        title: "Excluir este pedido?",
                        action: () =>
                          axios.delete("/api/v1/admin/order/" + order._id),
                      })
                    }
                  >
                    Excluir
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
      <Dialog
        open={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        aria-labelledby="delete-title"
      >
        <DialogTitle id="delete-title">{confirmation?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Esta ação remove o registro da loja. Confirme para continuar.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              const action = confirmation.action;
              setConfirmation(null);
              mutate(action);
            }}
          >
            Confirmar exclusão
          </Button>
        </DialogActions>
      </Dialog>
    </Page>
  );
}
