import React, { Fragment, useState } from 'react'
import "./Header.css";
import { SpeedDial, SpeedDialAction } from "@material-ui/lab";
import BackDrop from "@material-ui/core/Backdrop";
import DashboardIcon from "@material-ui/icons/Dashboard";
import PersonIcon from "@material-ui/icons/Person";
import ExitToAppIcon from "@material-ui/icons/ExitToApp";
import ListAltIcon from "@material-ui/icons/ListAlt";
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useAlert } from 'react-alert';
import { logout } from "../../../actions/userAction.js";

const UserOptions = ({ user }) => {
    const [open, setOpen] = useState(false)
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const alert = useAlert();
    const options = [
        { icon: <ListAltIcon />, name: "Orders", func: orders },
        { icon: <PersonIcon />, name: "Profile", func: account },
        { icon: <ExitToAppIcon />, name: "Logout", func: logoutUser },
    ];

    if (user.role === "admin") {
        options.unshift({
            icon: <DashboardIcon />,
            name: "Dashboard",
            func: dashboard,
        });
    };

    function dashboard() {
        navigate("/dashboard");
    }

    function orders() {
        navigate("/orders");
    }

    function account() {
        navigate("/account");
    }

    function logoutUser() {
        dispatch(logout())
        navigate("/");
        alert.success("Você saiu da conta.");
    }

    return (
        <Fragment>
            <BackDrop open={open} style={{ zIndex: "10" }} />
            <SpeedDial ariaLabel="SpeedDial tooltip example"
                onClose={() => setOpen(false)}
                onOpen={() => setOpen(true)}
                open={open}
                direction="down"
                className="speedDial"
                icon={<img
                    className="speedDialIcon"
                    src={user.avatar.url ? user.avatar.url : "/Profile.png"}
                    alt={"Profile"}
                />
                }
            >
                <div className="helloUser">
                    <p className="helloUser2">
                        Olá, {user.name}
                    </p>
                </div>
                {options.map((item) => (
                    <SpeedDialAction
                        className="iconProfile"
                        key={item.name}
                        icon={item.icon}
                        tooltipTitle={item.name}
                        onClick={item.func}
                    />
                ))}
            </SpeedDial>
        </Fragment>
    )
}

export default UserOptions