import { Alert, Button, Stack } from '@mui/material';
import TextField from '../layout/AccessibleTextField';
import { Link } from "react-router";
import FormLayout from "./FormLayout";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearErrors, forgotPassword } from "../../actions/userAction";
import { useAlert } from "../../utils/alerts.js";
import { FORGOT_PASSWORD_RESET } from "../../constants/userConstants";

const ForgotPassword = () => {
  const dispatch = useDispatch();
  const alert = useAlert();
  const [formError, setFormError] = useState('');

  const { error, message, loading } = useSelector(
    (state) => state.forgotPassword,
  );

  const [email, setEmail] = useState("");

  const forgotPasswordSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    dispatch(forgotPassword({ email }));
  };
  useEffect(() => {
    dispatch({ type: FORGOT_PASSWORD_RESET });
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      setFormError(error);

      dispatch(clearErrors());
    }

    if (message) {
      alert.success(message);
    }
  }, [dispatch, error, alert, message]);

  return (
    <FormLayout
      title="Recuperar senha"
      subtitle="Informe seu e-mail para receber o link de recuperação."
    >
      {message && (
        <Alert role="status" severity="success" sx={{ mb: 3 }}>
          {message}
        </Alert>
      )}
      {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
      <Stack component="form" spacing={2.5} onSubmit={forgotPasswordSubmit}>
        <TextField
          label="E-mail"
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          type="submit"
          className="forgotPasswordBtn"
          variant="contained"
          disabled={loading}
        >
          Enviar link de recuperação
        </Button>
        <Button component={Link} to="/login">
          Voltar para entrar
        </Button>
      </Stack>
    </FormLayout>
  );
};
export default ForgotPassword;
