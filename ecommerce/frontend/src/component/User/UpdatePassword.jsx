import { Button, Stack } from "@mui/material";

import FormLayout, { PasswordField } from "./FormLayout";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router";
import { clearErrors, updatePassword } from "../../actions/userAction";
import { useAlert } from "../../utils/alerts.js";
import { UPDATE_PASSWORD_RESET } from "../../constants/userConstants";

const UpdatePassword = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const alert = useAlert();
  const { error, isUpdated, loading } = useSelector((state) => state.profile);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const updatePasswordSubmit = (e) => {
    e.preventDefault();

    dispatch(updatePassword({ oldPassword, newPassword, confirmPassword }));
  };

  useEffect(() => {
    if (error) {
      alert.error(error);
      dispatch(clearErrors());
    }

    if (isUpdated) {
      alert.success("Senha alterada com sucesso!");

      navigate("/account");
      dispatch({
        type: UPDATE_PASSWORD_RESET,
      });
    }
  }, [dispatch, error, alert, navigate, isUpdated]);
  return (
    <FormLayout
      title="Alterar senha"
      subtitle="Escolha uma senha com pelo menos 8 caracteres."
    >
      <Stack component="form" spacing={2.5} onSubmit={updatePasswordSubmit}>
        <PasswordField
          label="Senha atual"
          autoComplete="current-password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
        />
        <PasswordField
          label="Nova senha"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <PasswordField
          label="Confirmar senha"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <Button
          type="submit"
          className="updatePasswordBtn"
          variant="contained"
          disabled={loading}
        >
          Alterar senha
        </Button>
      </Stack>
    </FormLayout>
  );
};
export default UpdatePassword;
