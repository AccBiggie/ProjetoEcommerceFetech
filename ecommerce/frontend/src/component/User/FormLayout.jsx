import { useId, useRef, useState } from "react";
import { Avatar, Button, Card, IconButton, InputAdornment, Stack, Typography } from '@mui/material';
import TextField from '../layout/AccessibleTextField';
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import Page from "../layout/Page";

export default function FormLayout({ title, subtitle, children }) {
  return (
    <Page title={title} subtitle={subtitle} maxWidth="sm">
      <Card sx={{ p: { xs: 2.5, sm: 4 } }}><Typography variant="body2" sx={{ mb: 2 }}>Campos marcados com * são obrigatórios.</Typography>{children}</Card>
    </Page>
  );
}
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete = "new-password",
  name,
  minLength,
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      label={label}
      name={name}
      type={visible ? "text" : "password"}
      required
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      slotProps={{
        htmlInput: { minLength },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setVisible((previous) => !previous)}
                aria-label={
                  (visible ? "Ocultar " : "Mostrar ") + label.toLowerCase()
                }
                edge="end"
              >
                <>
                  {visible ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                </>
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
export function AvatarUpload({ preview, onChange, error, selected, disabled }) {
  const input = useRef(null);
  const id = useId();
  return (
    <Stack sx={{ alignItems: "center" }} direction="row" spacing={2}>
      <Avatar
        src={preview}
        alt="Foto do perfil"
        sx={{ width: 56, height: 56 }}
      />
      <Stack>
        <Button onClick={() => input.current?.click()} aria-describedby={id + '-help'} disabled={disabled} variant="outlined" size="small">
          Escolher foto
        </Button>
          <input
            ref={input}
            id={id}
            type="file"
            aria-label="Escolher foto do perfil"
            aria-describedby={id + '-help' + (error ? ' ' + id + '-error' : '')}
            aria-invalid={Boolean(error)}
            disabled={disabled}
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            onChange={onChange}
            style={{ display: "none" }}
          />
        <Typography id={id + '-help'} variant="caption" color="textSecondary" sx={{ mt: 0.5 }}>
          Opcional. JPEG, PNG ou WebP; até 5 MiB.
        </Typography>
        <Typography role="status" variant="body2">{selected ? 'Foto selecionada. Salve para confirmar o envio.' : ''}</Typography>
        {error && <Typography id={id + '-error'} role="alert" color="error">{error}</Typography>}
      </Stack>
    </Stack>
  );
}
