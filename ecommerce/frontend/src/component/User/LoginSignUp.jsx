import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { Button, Link as MuiLink, Stack, Tab, Tabs } from "@mui/material";
import { TextField } from "@mui/material";
import { clearErrors, login, register } from "../../actions/userAction";
import { useAlert } from "../../utils/alerts";
import FormLayout, { AvatarUpload, PasswordField } from "./FormLayout";

export function LoginSignUp() {
  const dispatch = useDispatch(),
    navigate = useNavigate(),
    location = useLocation(),
    alert = useAlert();
  const { error, loading, isAuthenticated } = useSelector(
    (state) => state.user,
  );
  const [tab, setTab] = useState(0);
  const [loginEmail, setLoginEmail] = useState(""),
    [loginPassword, setLoginPassword] = useState("");
  const [user, setUser] = useState({ name: "", email: "", password: "" });
  const [avatar, setAvatar] = useState(),
    [preview, setPreview] = useState("/Profile.png");
  const requested =
    location.state?.returnTo ||
    new URLSearchParams(location.search).get("redirect") ||
    "/";
  const redirect =
    requested === "shipping"
      ? "/shipping"
      : requested.startsWith("/") &&
          !requested.startsWith("//") &&
          !requested.startsWith("/login")
        ? requested
        : "/";
  useEffect(() => {
    if (error) {
      alert.error(error);
      dispatch(clearErrors());
    }
    if (isAuthenticated) navigate(redirect, { replace: true });
  }, [error, alert, dispatch, isAuthenticated, navigate, redirect]);
  const upload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result);
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const submitRegister = (event) => {
    event.preventDefault();
    const form = new FormData();
    Object.entries(user).forEach(([key, value]) => form.set(key, value));
    if (avatar) form.set("avatar", avatar);
    dispatch(register(form));
  };
  return (
    <FormLayout
      title={tab === 0 ? "Bem-vindo de volta" : "Crie sua conta"}
      subtitle="Seu setup e seus pedidos em um só lugar."
    >
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant="fullWidth"
        aria-label="Acesso à conta"
        sx={{ mb: 3 }}
      >
        <Tab label="Entrar" />
        <Tab label="Criar conta" />
      </Tabs>
      {tab === 0 ? (
        <Stack
          component="form"
          className="loginForm"
          spacing={2.5}
          onSubmit={(event) => {
            event.preventDefault();
            dispatch(login(loginEmail, loginPassword));
          }}
        >
          <TextField
            label="E-mail"
            type="email"
            required
            autoComplete="email"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
          />
          <PasswordField
            label="Senha"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            autoComplete="current-password"
          />
          <MuiLink
            component={Link}
            to="/password/forgot"
            variant="body2"
            underline="hover"
          >
            Esqueci minha senha
          </MuiLink>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </Stack>
      ) : (
        <Stack
          component="form"
          className="signUpForm"
          spacing={2.5}
          onSubmit={submitRegister}
        >
          <TextField
            label="Nome"
            name="name"
            required
            autoComplete="name"
            value={user.name}
            onChange={(event) => setUser({ ...user, name: event.target.value })}
            slotProps={{ htmlInput: { minLength: 4, maxLength: 30 } }}
          />
          <TextField
            label="E-mail"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={user.email}
            onChange={(event) =>
              setUser({ ...user, email: event.target.value })
            }
          />
          <PasswordField
            label="Senha"
            name="password"
            minLength={8}
            value={user.password}
            onChange={(event) =>
              setUser({ ...user, password: event.target.value })
            }
          />
          <AvatarUpload preview={preview} onChange={upload} />
          <Button
            type="submit"
            className="signUpBtn"
            variant="contained"
            disabled={loading}
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </Button>
        </Stack>
      )}
    </FormLayout>
  );
}
