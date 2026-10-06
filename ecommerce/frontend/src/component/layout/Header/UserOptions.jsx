import React, { Fragment, useState } from 'react'
import "./Header.css";
import { SpeedDial, SpeedDialAction } from "@mui/material";
import BackDrop from "@mui/material/Backdrop";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PersonIcon from "@mui/icons-material/Person";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { useAlert } from "../../../utils/alerts.js";
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

    async function logoutUser() {
        if (await dispatch(logout())) {
            navigate("/");
            alert.success("Você saiu da conta.");
        } else alert.error("Não foi possível sair. Tente novamente.");
    }

    return (
        <Fragment>
            <BackDrop open={open} style={{ zIndex: "10" }} />
            {open && <p className="helloUser" style={{ position: 'fixed', top: 70, right: '3vmax', zIndex: 11, background: 'white', padding: 8 }}>Olá, {user.name}</p>}
            <SpeedDial ariaLabel="SpeedDial tooltip example"
                onClose={() => setOpen(false)}
                onOpen={() => setOpen(true)}
                open={open}
                direction="down"
                className="speedDial"
                icon={<img
                    className="speedDialIcon"
                    src={user.avatar?.url || "/Profile.png"}
                    alt={"Profile"}
                />
                }
            >
                {options.map((item) => (
                    <SpeedDialAction
                        className="iconProfile"
                        key={item.name}
                        icon={item.icon}
                        slotProps={{ tooltip: { title: item.name }, fab: { 'aria-label': item.name } }}
                        onClick={item.func}
                    />
                ))}
            </SpeedDial>
        </Fragment>
    )
}

export default UserOptions
