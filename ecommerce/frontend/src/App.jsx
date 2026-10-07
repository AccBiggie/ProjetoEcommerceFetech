import "./App.css";
import { BrowserRouter as Router } from "react-router";
import React from "react";
import Footer from "./component/layout/Footer/Footer.jsx";
import Routes from "./routes.jsx";
import store from "./store";
import { loadUser } from "./actions/userAction";
import Header from "./component/layout/Header/Header";
import ScrollToTop from "./component/layout/ScrollToTop";
import { Box } from "@mui/material";
import { ColorModeProvider } from "./context/ColorModeContext";
import { CategoriesProvider } from "./context/CategoriesContext";

function App() {
  React.useEffect(() => {
    store.dispatch(loadUser());
  }, []);

  return (
    <ColorModeProvider>
      <Router>
        <CategoriesProvider>
          <ScrollToTop />
          <Box
            sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
          >
            <Header />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Routes />
            </Box>
            <Footer />
          </Box>
        </CategoriesProvider>
      </Router>
    </ColorModeProvider>
  );
}

export default App;
