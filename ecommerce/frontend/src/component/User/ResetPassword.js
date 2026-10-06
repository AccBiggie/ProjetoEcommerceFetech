import React, { Fragment, useState, useEffect } from 'react';
import "./ResetPassword.css";
import Loader from '../layout/Loader/Loader';
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from 'react-router-dom';
import { FORGOT_PASSWORD_RESET } from '../../constants/userConstants';
import { loadUser } from '../../actions/userAction';
import { clearErrors, resetPassword } from "../../actions/userAction";
import { useAlert } from "react-alert";
import MetaData from "../layout/MetaData.js";
import LockOpenIcon from "@material-ui/icons/LockOpen";
import LockIcon from "@material-ui/icons/Lock";

const ResetPassword = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const alert = useAlert();
  
    const { error, success, loading } = useSelector(
      (state) => state.forgotPassword
    );
  
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
  
    const resetPasswordSubmit = (e) => {
      e.preventDefault();
  
      dispatch(resetPassword(token, { password, confirmPassword }));
    };
    useEffect(() => { dispatch({ type: FORGOT_PASSWORD_RESET }); }, [dispatch]);
  
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
      <Fragment>
        {loading ? (
          <Loader />
        ) : (
          <Fragment>
            <MetaData title="Change Password" />
            <div className="resetPasswordContainer">
              <div className="resetPasswordBox">
                <h2 className="resetPasswordHeading">Redefinir senha</h2>
  
                <form
                  className="resetPasswordForm"
                  onSubmit={resetPasswordSubmit}
                >
                  <div>
                    <LockOpenIcon />
                    <input
                      type="password"
                      placeholder="New Password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="loginPassword">
                    <LockIcon />
                    <input
                      type="password"
                      placeholder="Confirm Password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <input
                    type="submit"
                    value="Update"
                    className="resetPasswordBtn"
                  />
                </form>
              </div>
            </div>
          </Fragment>
        )}
      </Fragment>
    );
  };
  
  export default ResetPassword;
