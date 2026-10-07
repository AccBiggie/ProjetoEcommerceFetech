import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Divider, Drawer, IconButton,
  LinearProgress, Stack, TableCell, TableRow, TextField, Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import Close from "@mui/icons-material/Close";
import DataTable from "../layout/DataTable";
import { categoryDescendants, useCategories } from "../../context/CategoriesContext";
import { getErrorMessage } from "../../utils/api";

export default function CategoriesManager({ showTable, onChanged }) {
  const { categories, ordered, loading, error: loadError, reload } = useCategories();
  const [draft, setDraft] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(null);
  const nameInput = useRef(null);
  const drawerOpen = Boolean(draft);
  useEffect(() => {
    if (drawerOpen && error && !pending) nameInput.current?.focus();
  }, [drawerOpen, error, pending]);
  const excluded = categoryDescendants(categories, draft?._id);
  const open = category => {
    setError("");
    setNotice("");
    setDraft(category
      ? { ...category, parent_id: category.parent_id || "" }
      : { name: "", parent_id: "" });
  };
  const close = () => {
    if (!pending) {
      setDraft(null);
      setError("");
    }
  };
  const refresh = async () => {
    await reload();
    await onChanged();
  };
  const save = async event => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const payload = { name: draft.name, parent_id: draft.parent_id || null };
      if (draft._id) await axios.put(`/api/v1/admin/category/${draft._id}`, payload);
      else await axios.post("/api/v1/admin/category", payload);
      setDraft(null);
      setNotice("Categoria salva com sucesso.");
      await refresh();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await axios.delete(`/api/v1/admin/category/${deleting._id}`);
      setDeleting(null);
      await refresh();
      setNotice("Categoria excluída com sucesso.");
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return <>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3, justifyContent: "space-between", alignItems: { sm: "center" } }}>
      {showTable && <Box><Typography variant="h2">Categorias e subcategorias</Typography><Typography color="textSecondary">Organize os departamentos e seus vínculos.</Typography></Box>}
      <Button variant="contained" startIcon={<Add />} onClick={() => open()} disabled={pending || loading}>Cadastrar categoria</Button>
    </Stack>
    {loadError && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => reload().catch(() => {})}>Tentar novamente</Button>}>{loadError}</Alert>}
    {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
    {error && !draft && !deleting && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {showTable && <>
      {loading && <LinearProgress />}
      {!loading && !loadError && !categories.length && <Alert severity="info">Nenhuma categoria cadastrada. Cadastre a primeira categoria para organizar os produtos.</Alert>}
      {!!categories.length && <DataTable label="Categorias cadastradas" columns={["Nome", "Tipo", "Categoria pai", "Ações"]}>
        {ordered.map(category => <TableRow key={category._id}>
          <TableCell><Typography sx={{ pl: Math.min(category.depth, 4) * 2, overflowWrap: "anywhere" }}>{category.name}</Typography></TableCell>
          <TableCell><Chip size="small" label={category.parent_id ? "Subcategoria" : "Categoria"} /></TableCell>
          <TableCell>{categories.find(parent => parent._id === category.parent_id)?.name || "—"}</TableCell>
          <TableCell><Stack direction="row" spacing={1}>
            <Button size="small" disabled={pending} onClick={() => open(category)}>Editar</Button>
            <Button size="small" disabled={pending} onClick={() => open({ name: "", parent_id: category._id })}>Adicionar subcategoria</Button>
            <Button size="small" color="error" disabled={pending} onClick={() => { setError(""); setDeleting(category); }}>Excluir</Button>
          </Stack></TableCell>
        </TableRow>)}
      </DataTable>}
    </>}
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={close}
      slotProps={{
        paper: {
          role: "dialog",
          "aria-modal": true,
          "aria-labelledby": "category-drawer-title",
          sx: { width: { xs: "100%", sm: 460 }, maxWidth: "100%" },
        },
      }}
    >
      {draft && <Box component="form" onSubmit={save} sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <Stack direction="row" sx={{ px: 3, py: 2, justifyContent: "space-between", alignItems: "center" }}>
          <Typography id="category-drawer-title" variant="h2">{draft._id ? "Editar categoria" : "Nova categoria"}</Typography>
          <IconButton aria-label="Fechar cadastro de categoria" onClick={close} disabled={pending}><Close /></IconButton>
        </Stack>
        <Divider />
        {pending && <LinearProgress />}
        <Stack spacing={3} sx={{ p: 3, flex: 1, overflowY: "auto" }}>
          <Typography color="textSecondary">Escolha uma categoria pai para cadastrar uma subcategoria. Sem vínculo, o cadastro será uma categoria principal.</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            inputRef={nameInput}
            label="Nome da categoria"
            value={draft.name}
            required
            autoFocus
            disabled={pending}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            onChange={event => setDraft({ ...draft, name: event.target.value })}
          />
          <TextField
            select
            label="Categoria pai"
            value={draft.parent_id}
            disabled={pending}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            onChange={event => setDraft({ ...draft, parent_id: event.target.value })}
            helperText="Selecione o departamento ao qual esta subcategoria pertence."
          >
            <option value="">Sem categoria pai</option>
            {ordered.filter(category => !excluded.has(category._id)).map(category => <option key={category._id} value={category._id}>{category.label}</option>)}
          </TextField>
          <Chip sx={{ alignSelf: "flex-start" }} label={draft.parent_id ? "Subcategoria" : "Categoria principal"} />
        </Stack>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 3, justifyContent: "flex-end" }}>
          <Button onClick={close} disabled={pending}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={pending}>{pending ? "Salvando..." : "Salvar categoria"}</Button>
        </Stack>
      </Box>}
    </Drawer>
    <Dialog open={Boolean(deleting)} onClose={() => { if (!pending) setDeleting(null); }} aria-labelledby="category-delete-title">
      <DialogTitle id="category-delete-title">Excluir categoria?</DialogTitle>
      <DialogContent><DialogContentText>Excluir {deleting?.name}? Categorias com produtos ou subcategorias vinculados precisam ser reorganizadas antes da exclusão.</DialogContentText>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent>
      <DialogActions><Button disabled={pending} onClick={() => setDeleting(null)}>Cancelar</Button><Button disabled={pending} color="error" variant="contained" onClick={remove}>Confirmar exclusão</Button></DialogActions>
    </Dialog>
  </>;
}
