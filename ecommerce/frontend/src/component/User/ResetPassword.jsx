import { Button, Stack } from "@mui/material";

import FormLayout, { PasswordField } from "./FormLayout";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router";
import { FORGOT_PASSWORD_RESET } from "../../constants/userConstants";
import { loadUser } from "../../actions/userAction";
import { clearErrors, resetPassword } from "../../actions/userAction";
import { useAlert } from "../../utils/alerts.js";

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const alert = useAlert();

  const { error, success, loading } = useSelector(
    (state) => state.forgotPassword,
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const resetPasswordSubmit = (e) => {
    e.preventDefault();

    dispatch(resetPassword(token, { password, confirmPassword }));
  };
  useEffect(() => {
    dispatch({ type: FORGOT_PASSWORD_RESET });
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      alert.error(error);
      dispatch(clearErrors());
    }

    if (success) {
      alert.success("Senha alterada com sucesso.");

      dispatch(loadUser());
      navigate("/account", { replace: true });
    }
  }, [dispatch, error, alert, navigate, success]);

  return (
    <FormLayout
      title="Redefinir senha"
      subtitle="Defina sua nova senha para voltar à loja."
    >
      <Stack component="form" spacing={2.5} onSubmit={resetPasswordSubmit}>
        <PasswordField
          label="Nova senha"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordField
          label="Confirmar senha"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <Button
          type="submit"
          className="resetPasswordBtn"
          variant="contained"
          disabled={loading}
        >
          Salvar nova senha
        </Button>
      </Stack>
    </FormLayout>
  );
};
export default ResetPassword;
