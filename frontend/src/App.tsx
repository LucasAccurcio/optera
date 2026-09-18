import { useEffect, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { getHealth, type HealthResponse } from "./services/api/client";
import { Positions } from "./pages/Positions";
import { Summary } from "./pages/Summary";
import { Strategies } from "./pages/Strategies";
import { Imports } from "./pages/Imports";

const drawerWidth = 220;
export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  const links = [
    { label: "Posições", path: "/" },
    { label: "Estratégias", path: "/strategies" },
    { label: "Importar", path: "/imports" },
    { label: "Resumo", path: "/summary" },
  ];
  const navigation = (
    <List aria-label="Navegação principal">
      {links.map((link) => (
        <ListItemButton
          key={link.path}
          selected={location.pathname === link.path}
          component={NavLink}
          to={link.path}
          onClick={() => setDrawerOpen(false)}
        >
          <ListItemText primary={link.label} />
        </ListItemButton>
      ))}
    </List>
  );
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: 1201 }}>
        <Toolbar>
          {mobile && (
            <Button
              color="inherit"
              onClick={() => setDrawerOpen(true)}
              sx={{ minWidth: 0, mr: 1, fontSize: 22 }}
            >
              ≡
            </Button>
          )}
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            OPTERA
          </Typography>
          <Typography
            variant="body2"
            sx={{
              ml: 2,
              color: "text.secondary",
              display: { xs: "none", sm: "block" },
            }}
          >
            controle de opções
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant={mobile ? "temporary" : "permanent"}
        open={mobile ? drawerOpen : true}
        onClose={() => setDrawerOpen(false)}
        sx={{
          width: drawerWidth,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            pt: 8,
            bgcolor: "background.paper",
          },
        }}
      >
        {navigation}
      </Drawer>
      <Box
        component="main"
        sx={{ flexGrow: 1, pt: 11, px: { xs: 2, sm: 3, md: 6 }, minWidth: 0 }}
      >
        <Container maxWidth="lg" disableGutters>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 3 }}
              action={
                <button onClick={() => navigate(0)}>Tentar novamente</button>
              }
            >
              Não foi possível conectar à API: {error}
            </Alert>
          )}
          {!health && !error && (
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 3 }}>
              <CircularProgress size={18} />
              <Typography color="text.secondary">
                Verificando conexão com a API...
              </Typography>
            </Box>
          )}
          <Routes>
            <Route path="/" element={<Positions />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/imports" element={<Imports />} />
            <Route path="/summary" element={<Summary />} />
          </Routes>
        </Container>
      </Box>
    </Box>
  );
}
