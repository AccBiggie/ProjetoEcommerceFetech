import { Button, Stack, TextField } from "@mui/material";

import FormLayout, { AvatarUpload } from "./FormLayout";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearErrors, loadUser, updateProfile } from "../../actions/userAction";
import { useAlert } from "../../utils/alerts.js";
import { useNavigate } from "react-router";
import { UPDATE_PROFILE_RESET } from "../../constants/userConstants";

const UpdateProfile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const alert = useAlert();
  const { user } = useSelector((state) => state.user);
  const { error, isUpdated, loading } = useSelector((state) => state.profile);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState();
  const [avatarPreview, setAvatarPreview] = useState("/Profile.png");
  const updateProfileSubmit = (e) => {
    e.preventDefault();

    const myForm = new FormData();

    myForm.set("name", name);
    myForm.set("email", email);
    if (avatar) myForm.set("avatar", avatar);
    dispatch(updateProfile(myForm));
  };

  const updateProfileDataChange = (e) => {
    const reader = new FileReader();

    if (!e.target.files[0]) return;
    reader.onload = () => {
      if (reader.readyState === 2) {
        setAvatarPreview(reader.result);
        setAvatar(reader.result);
      }
    };
    reader.readAsDataURL(e.target.files[0]);
  };

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setAvatarPreview(user.avatar.url);
    }

    if (error) {
      alert.error(error);
      dispatch(clearErrors());
    }

    if (isUpdated) {
      alert.success("Perfil alterado com sucesso!");
      dispatch(loadUser());

      navigate("/account");
      dispatch({
        type: UPDATE_PROFILE_RESET,
      });
    }
  }, [dispatch, error, alert, navigate, user, isUpdated]);

  return (
    <FormLayout
      title="Editar perfil"
      subtitle="Mantenha suas informações atualizadas."
    >
      <Stack
        component="form"
        className="updateProfileForm"
        spacing={2.5}
        onSubmit={updateProfileSubmit}
      >
        <TextField
          label="Nome"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AvatarUpload
          preview={avatarPreview}
          onChange={updateProfileDataChange}
        />
        <Button
          type="submit"
          className="updateProfileBtn"
          variant="contained"
          disabled={loading}
        >
          Salvar alterações
        </Button>
      </Stack>
    </FormLayout>
  );
};
export default UpdateProfile;
