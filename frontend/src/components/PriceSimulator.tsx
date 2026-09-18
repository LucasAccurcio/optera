import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Slider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import type { Operation } from "../types/operations";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const formatMoney = (value: number) => money.format(value);

interface PriceSimulatorProps {
  operation: Operation;
  saving?: boolean;
  onSave: (price: string) => Promise<void>;
}

export function PriceSimulator({
  operation,
  saving = false,
  onSave,
}: PriceSimulatorProps) {
  const [price, setPrice] = useState(operation.simulatedClosingPrice);
  const maximum = Math.max(Number(operation.entryPremium) * 2, 0.01);
  const numericPrice = Number(price);
  const premium = Number(operation.entryPremium);
  const result =
    operation.side === "SELL"
      ? (premium - numericPrice) * operation.quantity
      : (numericPrice - premium) * operation.quantity;
  const percentage =
    premium === 0 ? 0 : result / (premium * operation.quantity);

  useEffect(
    () => setPrice(operation.simulatedClosingPrice),
    [operation.simulatedClosingPrice],
  );

  const setSafePrice = (value: string) => {
    if (value === "" || /^\d*(\.\d{0,6})?$/.test(value)) setPrice(value);
  };

  return (
    <Box
      sx={{
        mt: 3,
        p: { xs: 2, md: 2.5 },
        borderRadius: 2.5,
        bgcolor: "rgba(255,255,255,0.035)",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
      >
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ letterSpacing: ".12em" }}
          >
            Simulação de encerramento
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {formatMoney(numericPrice)}
          </Typography>
        </Box>
        <Chip
          size="small"
          color={result >= 0 ? "success" : "error"}
          label={`${percentage >= 0 ? "+" : ""}${(percentage * 100).toFixed(2)}%`}
        />
      </Stack>
      <Slider
        aria-label="Cotação simulada"
        value={
          Number.isFinite(numericPrice)
            ? Math.min(Math.max(numericPrice, 0), maximum)
            : 0
        }
        min={0}
        max={maximum}
        step={0.01}
        onChange={(_, value) => setPrice(Number(value).toFixed(2))}
        sx={{ mt: 2, color: "primary.main" }}
      />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ sm: "center" }}
        spacing={2}
      >
        <TextField
          label="Preço simulado"
          value={price}
          onChange={(event) => setSafePrice(event.target.value)}
          inputProps={{ inputMode: "decimal" }}
          size="small"
          sx={{ width: { xs: "100%", sm: 160 } }}
        />
        <Typography
          color={result >= 0 ? "success.main" : "error.main"}
          sx={{ fontWeight: 700 }}
        >
          Resultado estimado: {formatMoney(result)}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<SaveOutlinedIcon />}
          disabled={saving || price === "" || Number(price) < 0}
          onClick={() => onSave(price)}
          sx={{ ml: { sm: "auto" } }}
        >
          {saving ? "Salvando..." : "Salvar simulação"}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Faixa sugerida: R$ 0,00 a {formatMoney(maximum)}
      </Typography>
    </Box>
  );
}
