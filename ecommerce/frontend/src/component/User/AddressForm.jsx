import { normalizeShippingField } from '../../../../shared/shippingAddress.mjs';
import { useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Divider, Drawer, FormControlLabel,
  IconButton, LinearProgress, Stack, TextField, Typography,
} from "@mui/material";
import Close from "@mui/icons-material/Close";
import { getErrorMessage } from "../../utils/api";

const fields = [
  ["label", "Identificação do endereço", 80, "off"],
  ["recipientName", "Nome do destinatário", 120, "name"],
  ["pinCode", "CEP", 9, "postal-code"],
  ["address", "Endereço", 200, "address-line1"],
  ["number", "Número", 30, "off"],
  ["complement", "Complemento", 120, "address-line2"],
  ["neighborhood", "Bairro", 120, "off"],
  ["city", "Cidade", 120, "address-level2"],
  ["state", "Estado", 80, "address-level1"],
  ["country", "País", 80, "country-name"],
  ["phoneNo", "Telefone", 25, "tel"],
];

export default function AddressForm({ address, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    label: "", recipientName: "", pinCode: "", address: "", number: "",
    complement: "", neighborhood: "", city: "", state: "", country: "Brasil",
    phoneNo: "", favorite: false, ...address,
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const firstInput = useRef(null);
  useEffect(() => { if (error && !pending) firstInput.current?.focus(); }, [error, pending]);
  const close = () => { if (!pending) onClose(); };
  const submit = async event => {
    event.preventDefault();
    const errors = {};
    for (const [field] of fields) {
      if (field === 'label') {
        if (!draft.label.trim()) errors.label = 'Preencha este campo.';
        continue;
      }
      const value = ['pinCode', 'phoneNo'].includes(field) ? draft[field].replace(/\D/g, '') : draft[field];
      try { normalizeShippingField(field, value); } catch (error) { errors[field] = error.message; }
    }
    if (!/^[0-9\s-]+$/.test(draft.pinCode)) errors.pinCode = "Informe um CEP com 8 dígitos.";
    if (!/^[0-9\s()+.-]+$/.test(draft.phoneNo)) errors.phoneNo = "Informe um telefone com 10 a 15 dígitos, incluindo DDD.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setPending(true);
    setError("");
    try {
      const payload = Object.fromEntries(fields.map(([field]) => [field, draft[field].trim()]));
      payload.pinCode = payload.pinCode.replace(/\D/g, "");
      payload.phoneNo = payload.phoneNo.replace(/\D/g, "");
      payload.favorite = draft.favorite;
      await onSave(payload);
    } catch (error) { setError(getErrorMessage(error)); }
    finally { setPending(false); }
  };

  return (
    <Drawer anchor="right" open onClose={close} slotProps={{ paper: {
      role: "dialog", "aria-modal": true, "aria-labelledby": "address-form-title",
      sx: { width: { xs: "100%", sm: 580 }, maxWidth: "100%" },
    } }}>
      <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <Stack direction="row" sx={{ p: 2.5, alignItems: "center", justifyContent: "space-between" }}>
          <Typography id="address-form-title" variant="h2">{address._id ? "Editar endereço" : "Adicionar endereço"}</Typography>
          <IconButton aria-label="Fechar formulário de endereço" disabled={pending} onClick={close}><Close /></IconButton>
        </Stack>
        <Divider />
        {pending && <LinearProgress />}
        <Box sx={{ p: 3, flex: 1, overflowY: "auto", minHeight: 0 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2.5 }}>
            {fields.map(([field, label, maxLength, autoComplete], index) => (
              <TextField
                key={field}
                inputRef={index === 0 ? firstInput : undefined}
                autoFocus={index === 0}
                label={label}
                name={field}
                required={field !== "complement"}
                value={draft[field]}
                autoComplete={autoComplete}
                disabled={pending}
                error={Boolean(fieldErrors[field])}
                helperText={fieldErrors[field] || (field === "pinCode" ? "8 dígitos; pode incluir hífen." : field === "phoneNo" ? "Inclua o DDD." : undefined)}
                sx={{ gridColumn: ["label", "recipientName", "address"].includes(field) ? "1 / -1" : undefined }}
                slotProps={{ htmlInput: { maxLength, inputMode: field === "pinCode" ? "numeric" : field === "phoneNo" ? "tel" : undefined } }}
                onChange={event => {
                  setDraft({ ...draft, [field]: event.target.value });
                  setFieldErrors({ ...fieldErrors, [field]: undefined });
                }}
              />
            ))}
          </Box>
          <FormControlLabel sx={{ mt: 2 }} control={
            <Checkbox checked={draft.favorite} disabled={pending} onChange={event => setDraft({ ...draft, favorite: event.target.checked })} />
          } label="Definir como favorito" />
        </Box>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 2.5, justifyContent: "flex-end" }}>
          <Button onClick={close} disabled={pending}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={pending}>{pending ? "Salvando..." : "Salvar endereço"}</Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
