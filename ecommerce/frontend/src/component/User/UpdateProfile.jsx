import { Alert, Button, Stack } from '@mui/material';
import TextField from '../layout/AccessibleTextField';

import FormLayout, { AvatarUpload } from "./FormLayout";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearErrors, loadUser, updateProfile, uploadAvatar } from "../../actions/userAction";
import { getErrorMessage } from '../../utils/api';
import { useAlert } from "../../utils/alerts.js";
import { useNavigate } from "react-router";
import { UPDATE_PROFILE_RESET } from "../../constants/userConstants";

const UpdateProfile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const alert = useAlert();
  const [formError, setFormError] = useState('');
  const { user } = useSelector((state) => state.user);
  const { error, isUpdated, loading } = useSelector((state) => state.profile);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState();
  const [objectUrl, setObjectUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoPending, setPhotoPending] = useState(false);
  const avatarPreview = objectUrl || user?.avatar?.url || '/Profile.png';
  useEffect(() => {
    if (!avatar) { setObjectUrl(''); return; }
    const url = URL.createObjectURL(avatar); setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);
  const updateProfileSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    dispatch(updateProfile({ name, email }));
  };

  const updateProfileDataChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setPhotoError('');
    if (file.size > 5 * 1024 * 1024) { setPhotoError('A foto deve ter no máximo 5 MiB.'); setAvatar(undefined); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setPhotoError('Escolha uma imagem JPEG, PNG ou WebP.'); setAvatar(undefined); return; }
    setAvatar(file);
  };
  const savePhoto = async () => {
    setPhotoPending(true); setPhotoError('');
    try { await dispatch(uploadAvatar(avatar)); setAvatar(undefined); alert.success('Foto atualizada com sucesso!'); }
    catch (error) { setAvatar(undefined); setPhotoError(getErrorMessage(error)); }
    finally { setPhotoPending(false); }
  };

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user?._id, user?.name, user?.email]);
  useEffect(() => {
    if (error) {
      setFormError(error);

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
  }, [dispatch, error, alert, navigate, isUpdated]);

  return (
    <FormLayout
      title="Editar perfil"
      subtitle="Mantenha suas informações atualizadas."
    >
      {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
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
          error={photoError}
          selected={Boolean(avatar)}
          disabled={photoPending || loading}
          onChange={updateProfileDataChange}
        />
        <Button onClick={savePhoto} disabled={!avatar || photoPending || loading} variant="outlined">{photoPending ? 'Enviando foto...' : 'Salvar foto'}</Button>
        <Button
          type="submit"
          className="updateProfileBtn"
          variant="contained"
          disabled={loading || photoPending}
        >
          Salvar alterações
        </Button>
      </Stack>
    </FormLayout>
  );
};
export default UpdateProfile;
