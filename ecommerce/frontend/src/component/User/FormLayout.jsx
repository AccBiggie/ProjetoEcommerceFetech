import { useState } from "react";
import {
  Avatar,
  Button,
  Card,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import Page from "../layout/Page";

export default function FormLayout({ title, subtitle, children }) {
  return (
    <Page title={title} subtitle={subtitle} maxWidth="sm">
      <Card sx={{ p: { xs: 2.5, sm: 4 } }}>{children}</Card>
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
export function AvatarUpload({ preview, onChange }) {
  return (
    <Stack sx={{ alignItems: "center" }} direction="row" spacing={2}>
      <Avatar
        src={preview}
        alt="Foto do perfil"
        sx={{ width: 56, height: 56 }}
      />
      <Stack>
        <Button component="label" variant="outlined" size="small">
          Escolher foto
          <input
            type="file"
            name="avatar"
            accept="image/*"
            onChange={onChange}
            style={{ display: "none" }}
          />
        </Button>
        <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5 }}>
          Opcional
        </Typography>
      </Stack>
    </Stack>
  );
}
