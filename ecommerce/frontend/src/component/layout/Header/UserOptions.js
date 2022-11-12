import React, { Fragment, useState } from 'react'
import "./Header.css";
import { SpeedDial, SpeedDialAction } from "@material-ui/lab";
const UserOptions = ({ user }) => {
    const [open, setOpen] = useState(false);
    return (
        <Fragment>
            <SpeedDial ariaLabel="SpeedDial tooltip example"
                onClose={() => setOpen = (false)}
                onOpen={() => setOpen(true)}
                open={open}
                icon={ <img 
                    className="speedDialIcon"
                    src={user.avatar.url ? user.avatar.url : "/Profile.png"}
                    alt={"Profile"}/>}
            ></SpeedDial>
        </Fragment>
    )
}

export default UserOptions