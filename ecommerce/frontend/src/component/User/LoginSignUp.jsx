import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Box, Button, Link as MuiLink, Stack, Tab, Tabs } from "@mui/material";
import TextField from '../layout/AccessibleTextField';
import { clearErrors, login, register } from "../../actions/userAction";
import FormLayout, { PasswordField } from "./FormLayout";

export function LoginSignUp() {
  const dispatch = useDispatch(),
    navigate = useNavigate(),
    location = useLocation();
  const { error, loading, isAuthenticated } = useSelector(
    (state) => state.user,
  );
  const [tab, setTab] = useState(0);
  const [formError, setFormError] = useState('');
  const errorSummary = useRef(null);
  const [loginEmail, setLoginEmail] = useState(""),
    [loginPassword, setLoginPassword] = useState("");
  const [user, setUser] = useState({ name: "", email: "", password: "" });
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
      setFormError(error);
      requestAnimationFrame(() => errorSummary.current?.focus());
      dispatch(clearErrors());
    }
    if (isAuthenticated) navigate(redirect, { replace: true });
  }, [error, dispatch, isAuthenticated, navigate, redirect]);
  const submitRegister = (event) => {
    event.preventDefault();
    setFormError('');
    dispatch(register(user));
  };
  return (
    <FormLayout
      title={tab === 0 ? "Bem-vindo de volta" : "Crie sua conta"}
      subtitle="Seu setup e seus pedidos em um só lugar."
    >
      <Tabs
        value={tab}
        onChange={(_, value) => { setTab(value); setFormError(''); }}
        variant="fullWidth"
        aria-label="Acesso à conta"
        sx={{ mb: 3 }}
      >
        <Tab id="login-tab" aria-controls="account-access-panel" label="Entrar" />
        <Tab id="register-tab" aria-controls="account-access-panel" label="Criar conta" />
      </Tabs>
      {formError && <Alert ref={errorSummary} tabIndex={-1} severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
      <Box role="tabpanel" id="account-access-panel" aria-labelledby={tab === 0 ? 'login-tab' : 'register-tab'}>
      {tab === 0 ? (
        <Stack
          component="form"
          aria-labelledby="login-tab"
          aria-busy={loading}
          className="loginForm"
          spacing={2.5}
          onSubmit={(event) => {
            event.preventDefault();
            setFormError('');
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
          aria-labelledby="register-tab"
          aria-busy={loading}
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
      </Box>
    </FormLayout>
  );
}
