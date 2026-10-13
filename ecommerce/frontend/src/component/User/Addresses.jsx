import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, LinearProgress, Stack, Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import Star from "@mui/icons-material/Star";
import Page from "../layout/Page";
import AddressForm from "./AddressForm";
import { addressApi } from "../../utils/addressApi";
import { getErrorMessage } from "../../utils/api";
import { restoreActionFocus } from '../../utils/restoreActionFocus';

export default function Addresses() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const deleteTrigger = useRef(null);
  const createButton = useRef(null);
  const reload = useCallback(async () => {
    try {
      setAddresses(await addressApi.list());
      setError("");
    } catch (error) { setError(getErrorMessage(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const save = async payload => {
    if (draft._id) await addressApi.update(draft._id, payload);
    else await addressApi.create(payload);
    setDraft(null);
    setNotice("Endereço salvo com sucesso.");
    await reload();
  };
  const favorite = async address => {
    setPending(true);
    setError("");
    try {
      await addressApi.favorite(address._id);
      setNotice("Endereço favorito atualizado.");
      await reload();
    } catch (error) { setError(getErrorMessage(error)); }
    finally { setPending(false); }
  };
  const remove = async () => {
    setPending(true);
    setDeleteError("");
    try {
      await addressApi.remove(deleting._id);
      setDeleting(null);
      setNotice("Endereço excluído com sucesso.");
      await reload();
    } catch (error) { setDeleteError(getErrorMessage(error)); }
    finally { setPending(false); restoreActionFocus(deleteTrigger.current, createButton.current); }
  };

  return (
    <Page title="Meus endereços" subtitle="Cadastre e organize seus endereços de entrega.">
      <Button ref={createButton} startIcon={<Add />} variant="contained" disabled={loading || pending} onClick={() => { setNotice(""); setDraft({}); }}>Adicionar endereço</Button>
      {(loading || pending) && <LinearProgress sx={{ my: 3 }} />}
      {error && <Alert severity="error" sx={{ mt: 3 }} action={<Button color="inherit" onClick={reload}>Tentar novamente</Button>}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mt: 3 }} onClose={() => setNotice("")}>{notice}</Alert>}
      {!loading && !error && !addresses.length && <Alert severity="info" sx={{ mt: 3 }}>Você ainda não tem endereços cadastrados.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 3, mt: 3 }}>
        {addresses.map(address => (
          <Card key={address._id} component="article" aria-label={address.label} sx={{ p: 3, minWidth: 0, overflowWrap: "anywhere", borderColor: address.favorite ? "primary.main" : "divider" }}>
            <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="h2">{address.label}</Typography>
              {address.favorite && <Chip icon={<Star />} label="Favorito" size="small" color="primary" />}
            </Stack>
            <Typography sx={{ fontWeight: 650, mb: 1 }}>{address.recipientName}</Typography>
            <Typography>{address.address}, {address.number}</Typography>
            {address.complement && <Typography>{address.complement}</Typography>}
            <Typography>{address.neighborhood}</Typography>
            <Typography>{address.city} — {address.state}, {address.country}</Typography>
            <Typography>CEP {address.pinCode.replace(/^(\d{5})(\d{3})$/, "$1-$2")}</Typography>
            <Typography>Telefone: {address.phoneNo}</Typography>
            <Stack direction="row" useFlexGap spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
              <Button aria-label={'Editar endereço ' + address.label} disabled={pending} onClick={() => { setNotice(""); setDraft(address); }}>Editar</Button>
              <Button aria-label={'Excluir endereço ' + address.label} color="error" disabled={pending} onClick={() => { deleteTrigger.current = document.activeElement; setDeleteError(""); setDeleting(address); }}>Excluir</Button>
              {!address.favorite && <Button aria-label={'Tornar favorito ' + address.label} disabled={pending} onClick={() => favorite(address)}>Tornar favorito</Button>}
            </Stack>
          </Card>
        ))}
      </Box>
      {draft && <AddressForm address={draft} onSave={save} onClose={() => setDraft(null)} />}
      <Dialog open={Boolean(deleting)} slotProps={{ transition: { onExited: () => restoreActionFocus(deleteTrigger.current, createButton.current) } }} onClose={() => { if (!pending) setDeleting(null); }} aria-labelledby="address-delete-title" aria-describedby="address-delete-description">
        <DialogTitle id="address-delete-title">Excluir endereço?</DialogTitle>
        <DialogContent>
          <DialogContentText id="address-delete-description">Excluir o endereço {deleting?.label}? Pedidos já registrados manterão o endereço histórico.</DialogContentText>
          {deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button autoFocus disabled={pending} onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button disabled={pending} color="error" variant="contained" onClick={remove}>Confirmar exclusão</Button>
        </DialogActions>
      </Dialog>
    </Page>
  );
}
