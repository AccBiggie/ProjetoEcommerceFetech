import { parseMoneyToCents } from '../../utils/money';
import { Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, LinearProgress, Pagination, Link as MuiLink, Stack, Tab, TableCell, TableRow, Tabs, Typography } from '@mui/material';
import TextField from '../layout/AccessibleTextField';
import DataTable from "../layout/DataTable";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link } from "react-router";
import { useSelector } from "react-redux";
import Page from "../layout/Page";
import { useCategories } from "../../context/CategoriesContext";
import CategoriesManager from "./CategoriesManager";
import AuditTrail from './AuditTrail';
import PrivacyRequests from './PrivacyRequests';
import { getErrorMessage } from "../../utils/api";
import { money, statusLabel, paymentLabel } from "../../utils/format";

const emptyProduct = () => ({
  name: "",
  description: "",
  category_id: "",
  price: "",
  oldPrice: "",
  Stock: 10,
  imageUrl: "/demo-products/ProjetoLogoFetech2.svg",
});
export default function Dashboard() {
  const { ordered: categories } = useCategories();
  const { user } = useSelector((state) => state.user);
  const [confirmation, setConfirmation] = useState(null);
  const [userStatus, setUserStatus] = useState('active');
  const [archived, setArchived] = useState('active');
  const [tab, setTab] = useState("products");
  const [data, setData] = useState({ products: [], users: [], orders: [] });
  const [pages, setPages] = useState({ products: 1, users: 1, orders: 1 });
  const [pagination, setPagination] = useState({});
  const requestSequence = useRef(0);
  const productNameInput = useRef(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState(emptyProduct);
  const load = useCallback(async (signal) => {
    const sequence = ++requestSequence.current;
    const [products, users, orders] = await Promise.all([
      axios.get("/api/v1/admin/products", { signal, params: { page: pages.products, limit: 25 } }),
      axios.get("/api/v1/admin/users", { signal, params: { status: userStatus, page: pages.users, limit: 25 } }),
      axios.get("/api/v1/admin/orders", { signal, params: { archived, page: pages.orders, limit: 25 } }),
    ]);
    if (sequence !== requestSequence.current || signal?.aborted) return;
    setPagination({ products: products.data.pagination, users: users.data.pagination, orders: orders.data.pagination });
    setData({
      products: products.data.products,
      users: users.data.users,
      orders: orders.data.orders,
    });
  }, [archived, userStatus, pages]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error) => { if (!axios.isCancel(error) && !controller.signal.aborted) setError(getErrorMessage(error)); });
    return () => controller.abort();
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
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) document.querySelector('main h1')?.focus();
      });
    }
  };
  const saveProduct = (event) => {
    event.preventDefault();
    try { parseMoneyToCents(draft.price); if (draft.oldPrice) parseMoneyToCents(draft.oldPrice); }
    catch (error) { setError(error.message); return; }
    const payload = {
      name: draft.name,
      description: draft.description,
      category_id: draft.category_id,
      price: draft.price,
      oldPrice: draft.oldPrice || null,
      Stock: Number(draft.Stock),
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
          ["Produtos", pagination.products?.total ?? 0],
          ["Usuários", pagination.users?.total ?? 0],
          ["Pedidos", pagination.orders?.total ?? 0],
        ].map(([label, value]) => (
          <Card key={label} sx={{ p: 3 }}>
            <Typography color="textSecondary">{label}</Typography>
            <Typography component="p" variant="h1" sx={{ mt: 1 }}>
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
          ["categories", "Categorias"],
          ["users", "Usuários"],
          ["orders", "Pedidos"],
          ["audit", "Auditoria"],
            ['privacy', 'Privacidade'],
        ].map(([value, label]) => (
          <Tab key={value} id={'admin-tab-' + value} aria-controls="admin-panel" value={value} label={label} />
        ))}
      </Tabs>
      <Box id="admin-panel" role="tabpanel" aria-labelledby={'admin-tab-' + tab}>
      {pending && <Box role="status" aria-label="Processando alteração administrativa"><LinearProgress sx={{ mb: 2 }} /></Box>}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <CategoriesManager showTable={tab === "categories"} onChanged={load} />
      {tab === 'audit' && <AuditTrail />}
      {tab === 'privacy' && <PrivacyRequests />}
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
                  inputRef={key === 'name' ? productNameInput : undefined}
                  label={label}
                  required={key !== "oldPrice"}
                  multiline={key === "description"}
                  type={
                    ["price", "oldPrice", "Stock"].includes(key)
                      ? "number"
                      : "text"
                  }
                  value={draft[key] ?? ""}
                  slotProps={{
                    htmlInput: {
                      min: key === "Stock" ? 0 : 0.01,
                      step: key === "Stock" ? 1 : "any",
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
                required
                value={draft.category_id || ""}
                slotProps={{ select: { native: true } }}
                onChange={(event) =>
                  setDraft({ ...draft, category_id: event.target.value })
                }
              >
                <option value="">Selecione uma categoria</option>
                {categories.map((category) => (
                  <option key={category._id} value={category._id}>{category.label}</option>
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
                  {money(product.priceCents)}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      aria-label={'Editar produto ' + product.name}
                      disabled={pending}
                      onClick={() => mutate(async () => {
                        const { data } = await axios.get('/api/v1/product/' + product._id);
                        setDraft({ ...data.product, imageUrl: data.product.images[0]?.url || '/Profile.png' });
                        requestAnimationFrame(() => productNameInput.current?.focus());
                      })}
                    >
                      Editar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      aria-label={'Excluir produto ' + product.name}
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
        <Box>
        <TextField select label="Filtrar usuários" value={userStatus} disabled={pending}
          slotProps={{ select: { native: true } }} onChange={event => { setUserStatus(event.target.value); setPages(value => ({ ...value, users: 1 })); }} sx={{ mb: 2 }}>
          <option value="active">Ativos</option><option value="deactivated">Desativados</option><option value="all">Todos</option>
        </TextField>
        <DataTable
          label="Usuários cadastrados"
          columns={["Nome", "E-mail", "Status", "Perfil", "Ações"]}
        >
          {data.users.map((account) => (
            <TableRow key={account._id} hover>
              <TableCell>{account.name}</TableCell>
              <TableCell>{account.email}</TableCell>
              <TableCell><Chip size="small" label={account.accountStatus === "ACTIVE" ? "Ativo" : account.accountStatus === "DEACTIVATED" ? "Desativado" : "Estado inválido"} color={account.accountStatus === "ACTIVE" ? "success" : "default"} /></TableCell>
              <TableCell>
                <TextField
                  select
                  size="small"
                  value={account.role}
                  disabled={pending || account._id === user._id || account.accountStatus !== "ACTIVE"}
                  slotProps={{
                    select: { native: true },
                    htmlInput: { "aria-label": "Perfil da conta " + account._id },
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
                  color="primary"
                  aria-label={(account.accountStatus === 'DEACTIVATED' ? 'Reativar conta ' : 'Desativar conta ') + account._id}
                  disabled={pending || account._id === user._id || !["ACTIVE", "DEACTIVATED"].includes(account.accountStatus)}
                  onClick={() =>
                    setConfirmation({
                      title: account.accountStatus === "DEACTIVATED" ? "Reativar esta conta?" : "Desativar esta conta?",
                      description: account.accountStatus === "DEACTIVATED" ? "O usuário poderá entrar novamente com sua senha atual. As sessões antigas continuam inválidas." : "O acesso será bloqueado e as sessões serão revogadas. Pedidos, endereços, avaliações e histórico serão preservados.",
                      label: account.accountStatus === "DEACTIVATED" ? "Confirmar reativação" : "Confirmar desativação",
                      color: "primary",
                      action: () => axios.patch("/api/v1/admin/user/" + account._id + (account.accountStatus === "DEACTIVATED" ? "/reactivate" : "/deactivate")),
                    })
                  }
                >
                  {account.accountStatus === "DEACTIVATED" ? "Reativar conta" : "Desativar conta"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
        </Box>
      )}
      {tab === "orders" && (
        <Box>
        <TextField select label="Filtrar pedidos" value={archived} disabled={pending}
          slotProps={{ select: { native: true } }} onChange={event => { setArchived(event.target.value); setPages(value => ({ ...value, orders: 1 })); }} sx={{ mb: 2 }}>
          <option value="active">Ativos</option><option value="archived">Arquivados</option><option value="all">Todos</option>
        </TextField>
        <DataTable
          label="Pedidos da loja"
          columns={["Pedido", "Status", "Pagamento", "Total", "Ações"]}
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
                {order.administrativeArchivedAt && <Chip size="small" label="Arquivado" sx={{ ml: 1 }} />}
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
              <TableCell><Chip size="small" label={paymentLabel(order)} color={order.paymentConfirmed ? "success" : "default"} /></TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {money(order.totalPriceCents)}
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={1}>
                  {order.orderStatus !== "Delivered" && (
                    <Button
                      aria-label={(order.orderStatus === 'Processing' ? 'Marcar enviado ' : 'Marcar entregue ') + order._id}
                      disabled={pending || !order.paymentConfirmed}
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
                  {!order.paymentConfirmed && order.orderStatus !== "Delivered" && <Typography variant="caption">O envio ficará disponível após a confirmação do pagamento.</Typography>}
                  <Button
                    color="primary"
                    aria-label={(order.administrativeArchivedAt ? 'Desarquivar pedido ' : 'Arquivar pedido ') + order._id}
                    disabled={pending}
                    onClick={() =>
                      setConfirmation({
                        title: order.administrativeArchivedAt ? "Desarquivar este pedido?" : "Arquivar este pedido?",
                        description: "O pedido e seu histórico serão preservados.",
                        label: order.administrativeArchivedAt ? "Confirmar desarquivamento" : "Confirmar arquivamento",
                        color: "primary",
                        action: () => axios.patch("/api/v1/admin/order/" + order._id + (order.administrativeArchivedAt ? "/unarchive" : "/archive")),
                      })
                    }
                  >
                    {order.administrativeArchivedAt ? "Desarquivar" : "Arquivar"}
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
        </Box>
      )}
      {pagination[tab]?.pages > 1 && <Pagination aria-label={'Paginação de ' + tab} sx={{ mt: 3 }} count={pagination[tab].pages} page={pages[tab]} disabled={pending}
        onChange={(_, page) => setPages(value => ({ ...value, [tab]: page }))} />}
      <Dialog
        open={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
      >
        <DialogTitle id="delete-title">{confirmation?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-description">
            {confirmation?.description || "Esta ação remove o registro da loja. Confirme para continuar."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setConfirmation(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color={confirmation?.color || "error"}
            onClick={() => {
              const action = confirmation.action;
              setConfirmation(null);
              mutate(action);
            }}
          >
            {confirmation?.label || "Confirmar exclusão"}
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </Page>
  );
}
