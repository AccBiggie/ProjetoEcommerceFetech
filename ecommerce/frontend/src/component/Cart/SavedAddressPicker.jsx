import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Alert, Box, Button, Card, Chip, FormControl, FormControlLabel,
  FormLabel, LinearProgress, Radio, RadioGroup, Stack, Typography,
} from "@mui/material";
import { addressApi } from "../../utils/addressApi";
import { getErrorMessage } from "../../utils/api";

export default function SavedAddressPicker({ selectedId, onSelect, disabled }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    addressApi.list().then(addresses => {
      if (active) setAddresses(addresses);
    }).catch(error => {
      if (active) setError(getErrorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, mb: 1 }}>
        <Typography variant="h3">Seus endereços cadastrados</Typography>
        <Button component={Link} to="/addresses" size="small" disabled={disabled}>Gerenciar endereços</Button>
      </Stack>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Escolha um endereço para preencher os campos abaixo, ou informe outro endereço.
      </Typography>
      {loading && <LinearProgress aria-label="Carregando endereços" sx={{ mb: 2 }} />}
      {error && <Alert severity="warning" sx={{ mb: 2 }} action={
        <Button color="inherit" disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Tentar novamente</Button>
      }>Não foi possível carregar seus endereços. Você pode preencher os campos manualmente. {error}</Alert>}
      {!loading && !error && !addresses.length && <Alert severity="info" sx={{ mb: 2 }}>Você ainda não tem endereços cadastrados. Preencha os campos abaixo ou cadastre um endereço em Meus endereços.</Alert>}
      {!!addresses.length && (
        <FormControl component="fieldset" disabled={disabled} sx={{ width: "100%", minWidth: 0 }}>
          <FormLabel component="legend">Escolha o endereço de entrega</FormLabel>
          <RadioGroup
            name="savedDeliveryAddress"
            value={selectedId}
            onChange={event => onSelect(addresses.find(address => address._id === event.target.value) || null)}
          >
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2, mt: 1 }}>
              {addresses.map(address => (
                <Card
                  key={address._id}
                  component="label"
                  sx={{
                    p: 2, display: "flex", alignItems: "flex-start", minWidth: 0,
                    cursor: disabled ? "default" : "pointer",
                    borderColor: selectedId === address._id ? "primary.main" : "divider",
                    bgcolor: selectedId === address._id ? "action.selected" : "background.paper",
                    "&:focus-within": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                  }}
                >
                  <Radio value={address._id} disabled={disabled} slotProps={{ input: { "aria-label": `Usar endereço ${address.label}` } }} sx={{ p: 0.5, mr: 1 }} />
                  <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 1 }}>
                      <Typography sx={{ fontWeight: 700 }}>{address.label}</Typography>
                      {address.favorite && <Chip size="small" label="Favorito" color="primary" />}
                    </Stack>
                    <Typography variant="body2">{address.recipientName}</Typography>
                    <Typography variant="body2">{address.address}, {address.number}</Typography>
                    {address.complement && <Typography variant="body2">{address.complement}</Typography>}
                    <Typography variant="body2">{address.neighborhood}</Typography>
                    <Typography variant="body2">{address.city} — {address.state}, {address.country}</Typography>
                    <Typography variant="body2">CEP {address.pinCode.replace(/^(\d{5})(\d{3})$/, "$1-$2")}</Typography>
                    <Typography variant="body2" color="textSecondary">Telefone: {address.phoneNo}</Typography>
                  </Box>
                </Card>
              ))}
            </Box>
            <FormControlLabel value="" control={<Radio />} label="Preencher ou ajustar manualmente" sx={{ mt: 1 }} />
          </RadioGroup>
        </FormControl>
      )}
    </Box>
  );
}
