import { useEffect, useState } from "react";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { getSummary } from "../services/api/client";
import type { Summary as SummaryData } from "../types/summary";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const formatMoney = (value: string) => money.format(Number(value));

function MetricCard({
  label,
  value,
  detail,
  tone = "text.primary",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: string;
}) {
  return (
    <Card
      sx={{
        height: "100%",
        border: "1px solid",
        borderColor: "divider",
        backgroundImage: "none",
      }}
    >
      <CardContent>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ letterSpacing: ".1em" }}
        >
          {label}
        </Typography>
        <Typography variant="h4" sx={{ mt: 1, fontWeight: 800, color: tone }}>
          {value}
        </Typography>
        {detail && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {detail}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function Summary() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getSummary());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar o resumo.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        gap={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4">Resumo</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Uma visão consolidada das suas operações.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshRoundedIcon />}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {loading && !summary ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        summary && (
          <Stack spacing={2.5}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
                gap: 2,
              }}
            >
              <MetricCard
                label="Operações abertas"
                value={summary.openOperations}
                detail="resultado simulado"
              />
              <MetricCard
                label="Operações encerradas"
                value={summary.closedOperations}
                detail="resultado realizado"
              />
              <MetricCard
                label="Resultado realizado"
                value={formatMoney(summary.realizedResult)}
                tone={
                  Number(summary.realizedResult) >= 0
                    ? "success.main"
                    : "error.main"
                }
              />
              <MetricCard
                label="Resultado simulado"
                value={formatMoney(summary.simulatedResult)}
                tone={
                  Number(summary.simulatedResult) >= 0
                    ? "success.main"
                    : "error.main"
                }
              />
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  lg: "repeat(4, 1fr)",
                },
                gap: 2,
              }}
            >
              <MetricCard
                label="Prêmios recebidos"
                value={formatMoney(summary.totalPremiumReceived)}
                detail="operações vendidas"
                tone="success.main"
              />
              <MetricCard
                label="Prêmios pagos"
                value={formatMoney(summary.totalPremiumPaid)}
                detail="operações compradas"
                tone="warning.main"
              />
              <MetricCard
                label="Operações lucrativas"
                value={summary.profitableOperations}
                detail="considerando resultado aplicável"
                tone="success.main"
              />
              <MetricCard
                label="Operações com prejuízo"
                value={summary.lossMakingOperations}
                detail="considerando resultado aplicável"
                tone="error.main"
              />
            </Box>
          </Stack>
        )
      )}
    </Box>
  );
}
