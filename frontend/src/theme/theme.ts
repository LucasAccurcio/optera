import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: { mode: 'dark', primary: { main: '#77e0c2' }, secondary: { main: '#a9b9ff' }, background: { default: '#101419', paper: '#171d24' }, success: { main: '#77e0c2' }, warning: { main: '#f5c76b' }, error: { main: '#ff8f8f' } },
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', h4: { fontWeight: 700, letterSpacing: '-0.03em' } },
  shape: { borderRadius: 12 },
  components: { MuiButton: { defaultProps: { disableElevation: true } }, MuiCssBaseline: { styleOverrides: { body: { margin: 0 }, ':focus-visible': { outline: '2px solid #77e0c2', outlineOffset: 3 } } } },
});
