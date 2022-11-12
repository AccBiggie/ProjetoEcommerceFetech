import "./App.css";
import { BrowserRouter as Router} from "react-router-dom";
import WebFont from "webfontloader";
import React from "react";
import Footer from "./component/layout/Footer/Footer.js";
import Routes from "./routes.js";
//import Navbar from "./component/layout/Navbar/Navbar.js";

function App() {
    React.useEffect(() => {
        WebFont.load({
            google: {
                families:["Roboto", "Droid Sans", "Chilanka"],
            },
        });
    },[]);
    
    return (
        <Router>
            <Routes />
            <Footer/>
        </Router>
    );
}

export default App;
