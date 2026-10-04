import { useEffect, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  addStrategyOperation,
  closeStrategy,
  createStrategy,
  deleteStrategy,
  getAvailableOperationsForStrategy,
  getStrategies,
  getStrategyAlerts,
  getStrategySimulation,
  removeStrategyOperation,
  setStrategyAssetPrice,
} from "../services/api/client";
import type { Operation } from "../types/operations";
import type {
  Strategy,
  StrategyAlerts,
  StrategyCloseLegInput,
  StrategyInput,
  StrategySimulation,
} from "../types/strategies";

const initialInput: StrategyInput = {
  name: "",
  asset: "",
  type: "",
  openedAt: new Date().toISOString().slice(0, 10),
  notes: "",
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const formatMoney = (value: string) => money.format(Number(value));

function StrategyForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  value: StrategyInput;
  saving: boolean;
  onChange: (value: StrategyInput) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nova estratégia</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Nome"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            required
          />
          <TextField
            label="Ativo"
            value={value.asset}
            onChange={(e) => onChange({ ...value, asset: e.target.value })}
            required
          />
          <TextField
            label="Tipo de estratégia"
            value={value.type ?? ""}
            onChange={(e) => onChange({ ...value, type: e.target.value })}
            placeholder="Ex.: Trava de baixa"
          />
          <TextField
            label="Data de abertura"
            type="date"
            value={value.openedAt}
            onChange={(e) => onChange({ ...value, openedAt: e.target.value })}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            label="Observações"
            value={value.notes ?? ""}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={onSubmit} disabled={saving}>
          {saving ? "Salvando..." : "Criar estratégia"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selectedOperation, setSelectedOperation] = useState("");
  const [form, setForm] = useState(initialInput);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertsByStrategy, setAlertsByStrategy] = useState<Record<string, StrategyAlerts | null>>({});
  const [scenarioPrices, setScenarioPrices] = useState<Record<string, string>>({});
  const [simulations, setSimulations] = useState<Record<string, StrategySimulation | null>>({});
  const [closingStrategy, setClosingStrategy] = useState<Strategy | null>(null);
  const [closeValues, setCloseValues] = useState<Record<string, { closedAt: string; actualClosingPrice: string }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [strategyResponse, operationResponse] = await Promise.all([
        getStrategies(),
        getAvailableOperationsForStrategy(),
      ]);
      setStrategies(strategyResponse);
      setOperations(operationResponse.data);
      const alertEntries = await Promise.all(strategyResponse.map(async (strategy) => {
        try {
          return [strategy.id, await getStrategyAlerts(strategy.id)] as const;
        } catch {
          return [strategy.id, null] as const;
        }
      }));
      setAlertsByStrategy(Object.fromEntries(alertEntries));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar as estratégias.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await createStrategy(form);
      setCreating(false);
      setForm({
        ...initialInput,
        openedAt: new Date().toISOString().slice(0, 10),
      });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível criar a estratégia.",
      );
    } finally {
      setSaving(false);
    }
  };
  const addLeg = async (strategy: Strategy) => {
    if (!selectedOperation) return;
    try {
      const updated = await addStrategyOperation(
        strategy.id,
        selectedOperation,
      );
      setStrategies((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setOperations((current) =>
        current.filter((operation) => operation.id !== selectedOperation),
      );
      setSelectedOperation("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível associar a operação.",
      );
    }
  };
  const removeLeg = async (strategy: Strategy, operationId: string) => {
    try {
      const updated = await removeStrategyOperation(strategy.id, operationId);
      setStrategies((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      const available = await getAvailableOperationsForStrategy();
      setOperations(available.data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível remover a perna.",
      );
    }
  };
  const remove = async (strategy: Strategy) => {
    if (
      !window.confirm(
        `Excluir a estratégia ${strategy.name}? As operações serão preservadas.`,
      )
    )
      return;
    try {
      await deleteStrategy(strategy.id);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir a estratégia.",
      );
    }
  };

  const simulateExpiration = async (strategyId: string) => {
    const price = scenarioPrices[strategyId] ?? "";
    if (!price) return;
    try {
      await setStrategyAssetPrice(strategyId, price);
      const simulation = await getStrategySimulation(strategyId);
      setSimulations((current) => ({ ...current, [strategyId]: simulation }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível simular o vencimento.");
    }
  };

  const openStrategyClose = (strategy: Strategy) => {
    const today = new Date().toISOString().slice(0, 10);
    setClosingStrategy(strategy);
    setCloseValues(Object.fromEntries(
      strategy.operations
        .filter((leg) => leg.openQuantity > 0)
        .map((leg) => [leg.id, {
          closedAt: today,
          actualClosingPrice: leg.simulatedClosingPrice,
        }]),
    ));
  };

  const saveStrategyClose = async () => {
    if (!closingStrategy) return;
    setSaving(true);
    try {
      const legs: StrategyCloseLegInput[] = closingStrategy.operations
        .filter((leg) => leg.openQuantity > 0)
        .map((leg) => ({
          operationId: leg.id,
          quantity: leg.openQuantity,
          actualClosingPrice: closeValues[leg.id]?.actualClosingPrice ?? "",
          closedAt: closeValues[leg.id]?.closedAt ?? "",
        }));
      await closeStrategy(closingStrategy.id, legs);
      setClosingStrategy(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível encerrar a estratégia.");
    } finally {
      setSaving(false);
    }
  };

  const updateCloseValue = (
    operationId: string,
    field: "closedAt" | "actualClosingPrice",
    value: string,
  ) => setCloseValues((current) => ({
    ...current,
    [operationId]: { ...current[operationId], [field]: value },
  }));

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
          <Typography variant="h4">Estratégias</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Agrupe pernas e acompanhe o resultado consolidado.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => setCreating(true)}
        >
          Nova estratégia
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {loading ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={250} />
          <Skeleton variant="rounded" height={250} />
        </Stack>
      ) : strategies.length === 0 ? (
        <Card
          sx={{
            p: 5,
            textAlign: "center",
            border: "1px dashed",
            borderColor: "divider",
            backgroundImage: "none",
          }}
        >
          <Typography variant="h6">Nenhuma estratégia criada</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Crie uma estratégia e associe suas operações como pernas.
          </Typography>
        </Card>
      ) : (
        <Stack spacing={2}>
          {strategies.map((strategy) => (
            <Card
              key={strategy.id}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                backgroundImage: "none",
              }}
            >
              <CardContent>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  gap={1}
                >
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {strategy.name}
                      </Typography>
                      <Chip
                        size="small"
                        label={
                          strategy.status === "OPEN"
                            ? "Aberta"
                            : strategy.status === "PARTIALLY_CLOSED"
                              ? "Parcialmente encerrada"
                              : "Encerrada"
                        }
                        color={
                          strategy.status === "OPEN"
                            ? "primary"
                            : strategy.status === "PARTIALLY_CLOSED"
                              ? "warning"
                              : "default"
                        }
                      />
                    </Stack>
                    <Typography color="text.secondary" variant="body2">
                      {strategy.asset}
                      {strategy.type ? ` · ${strategy.type}` : ""} · abertura{" "}
                      {strategy.openedAt}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => openStrategyClose(strategy)}
                      disabled={!strategy.operations.some((leg) => leg.openQuantity > 0)}
                    >
                      Encerrar estratégia
                    </Button>
                    <Button
                      color="error"
                      size="small"
                      startIcon={<DeleteOutlineRoundedIcon />}
                      onClick={() => void remove(strategy)}
                      disabled={strategy.operations.some((leg) => leg.closedQuantity > 0)}
                    >
                      Excluir
                    </Button>
                  </Stack>
                </Stack>
                <Stack
                  direction="row"
                  flexWrap="wrap"
                  gap={{ xs: 2, sm: 5 }}
                  sx={{ mt: 2.5 }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Prêmio inicial total
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      {formatMoney(strategy.totalPremium)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Resultado realizado
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      {formatMoney(strategy.realizedResult)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Estimado em aberto
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      {formatMoney(strategy.estimatedOpenResult)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Projetado total
                    </Typography>
                    <Typography
                      sx={{ fontWeight: 700 }}
                      color={Number(strategy.result) >= 0 ? "success.main" : "error.main"}
                    >
                      {formatMoney(strategy.result)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Percentual projetado
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      {(Number(strategy.resultPercentage) * 100).toFixed(2)}%
                    </Typography>
                  </Box>
                  {strategy.maxProfitCapturedPercentage !== null && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Lucro máximo capturado
                      </Typography>
                      <Typography sx={{ fontWeight: 700 }}>
                        {Number(strategy.maxProfitCapturedPercentage).toFixed(2)}%
                      </Typography>
                    </Box>
                  )}
                </Stack>
                {strategy.spreadAnalysis?.status === "supported" && (
                  <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: "rgba(255,255,255,.035)" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                      {strategy.spreadAnalysis.strategyType === "BEAR_PUT"
                        ? "Trava de baixa com PUT"
                        : "Trava de alta com CALL"} · limites do saldo aberto
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={{ xs: 2, sm: 4 }}>
                      <Typography variant="body2">Lucro máximo: {formatMoney(strategy.spreadAnalysis.maxProfit)}</Typography>
                      <Typography variant="body2">Perda máxima: {formatMoney(strategy.spreadAnalysis.maxLoss)}</Typography>
                      <Typography variant="body2">Breakeven: {formatMoney(strategy.spreadAnalysis.breakeven)}</Typography>
                      <Typography variant="body2">Largura: {formatMoney(strategy.spreadAnalysis.width)}</Typography>
                      <Typography variant="body2">Débito líquido: {formatMoney(strategy.spreadAnalysis.netDebitTotal)}</Typography>
                      <Typography variant="body2">Retorno/risco: {Number(strategy.spreadAnalysis.returnRiskRatio).toFixed(2)}x</Typography>
                    </Stack>
                  </Box>
                )}
                {alertsByStrategy[strategy.id]?.alerts.map((alert, index) => (
                  <Alert
                    key={`${alert.type}-${alert.operationId ?? "strategy"}-${index}`}
                    severity={alert.severity === "critical" ? "error" : alert.severity}
                    sx={{ mt: 1.5 }}
                  >
                    {alert.message}
                  </Alert>
                ))}
                {strategy.spreadAnalysis?.status === "supported" && (
                  <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: "rgba(255,255,255,.035)" }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                      Cenário manual no vencimento
                    </Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <TextField
                        size="small"
                        label="Preço manual do ativo"
                        value={scenarioPrices[strategy.id] ?? ""}
                        onChange={(event) => setScenarioPrices((current) => ({
                          ...current,
                          [strategy.id]: event.target.value,
                        }))}
                        inputProps={{ inputMode: "decimal" }}
                      />
                      <Button
                        variant="outlined"
                        disabled={!scenarioPrices[strategy.id]?.trim()}
                        onClick={() => void simulateExpiration(strategy.id)}
                      >
                        Calcular cenário
                      </Button>
                    </Stack>
                    {simulations[strategy.id]?.result !== null &&
                      simulations[strategy.id]?.result !== undefined && (
                        <Alert severity="info" sx={{ mt: 1.5 }}>
                          {simulations[strategy.id]?.strategyType} · {simulations[strategy.id]?.scenario} ·{" "}
                          Resultado: {formatMoney(simulations[strategy.id]!.result!)}
                        </Alert>
                      )}
                  </Box>
                )}
                <Divider sx={{ my: 2 }} />
                {strategy.operations.length === 0 ? (
                  <Typography color="text.secondary">
                    Nenhuma perna associada.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {strategy.operations.map((leg) => (
                      <Box key={leg.id}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          alignItems={{ sm: "center" }}
                          justifyContent="space-between"
                          gap={1}
                          sx={{
                            p: 1.5,
                            borderRadius: 1.5,
                            bgcolor: "rgba(255,255,255,.035)",
                          }}
                        >
                          <Box>
                            <Typography sx={{ fontWeight: 700 }}>
                              {leg.optionTicker}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {leg.optionType} · {leg.side === "BUY" ? "Compra" : "Venda"} ·{" "}
                              {leg.openQuantity} abertas / {leg.closedQuantity} encerradas de {leg.quantity}
                            </Typography>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={{ sm: 2 }} sx={{ mt: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                Realizado: {formatMoney(leg.realizedResult)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Estimado aberto: {formatMoney(leg.estimatedOpenResult)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Protegidas: {leg.protectedQuantity} · Residuais: {leg.unprotectedQuantity}
                              </Typography>
                            </Stack>
                          </Box>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography
                              color={Number(leg.result) >= 0 ? "success.main" : "error.main"}
                            >
                              {formatMoney(leg.result)}
                            </Typography>
                            <Button
                              aria-label={`Remover ${leg.optionTicker}`}
                              size="small"
                              color="inherit"
                              onClick={() => void removeLeg(strategy, leg.id)}
                              disabled={leg.closedQuantity > 0}
                            >
                              <RemoveCircleOutlineRoundedIcon fontSize="small" />
                            </Button>
                          </Stack>
                        </Stack>
                        {leg.closures.length > 0 && (
                          <Stack spacing={0.25} sx={{ pl: 2, pt: 0.75 }}>
                            <Typography variant="caption" color="text.secondary">
                              Histórico de encerramentos
                            </Typography>
                            {leg.closures.map((closure) => (
                              <Typography key={closure.id} variant="caption" color="text.secondary">
                                {closure.closedAt} · {closure.quantity} opções · {formatMoney(closure.actualClosingPrice)}
                              </Typography>
                            ))}
                          </Stack>
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{ mt: 2 }}
                >
                  <FormControl size="small" fullWidth>
                    <InputLabel>Adicionar operação</InputLabel>
                    <Select
                      label="Adicionar operação"
                      value={selectedOperation}
                      onChange={(e) => setSelectedOperation(e.target.value)}
                    >
                      <MenuItem value="">Selecione uma operação</MenuItem>
                      {operations
                        .map((operation) => (
                          <MenuItem key={operation.id} value={operation.id}>
                            {operation.optionTicker} ·{" "}
                            {operation.side === "BUY" ? "Compra" : "Venda"}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    onClick={() => void addLeg(strategy)}
                    disabled={!selectedOperation}
                  >
                    Adicionar perna
                  </Button>
                </Stack>
                {closingStrategy?.id === strategy.id && (
                  <Dialog
                    open
                    onClose={() => setClosingStrategy(null)}
                    fullWidth
                    maxWidth="sm"
                  >
                    <DialogTitle>Encerrar estratégia</DialogTitle>
                    <DialogContent dividers>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Informe o preço efetivo e a data de encerramento de cada quantidade aberta. Nenhuma ordem será enviada.
                      </Typography>
                      <Stack spacing={2} sx={{ pt: 1 }}>
                        {strategy.operations
                          .filter((leg) => leg.openQuantity > 0)
                          .map((leg) => (
                            <Box key={leg.id}>
                              <Typography sx={{ fontWeight: 700 }}>
                                {leg.optionTicker} · {leg.openQuantity} opções abertas
                              </Typography>
                              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1 }}>
                                <TextField
                                  label="Data de encerramento"
                                  type="date"
                                  value={closeValues[leg.id]?.closedAt ?? ""}
                                  onChange={(event) => updateCloseValue(leg.id, "closedAt", event.target.value)}
                                  InputLabelProps={{ shrink: true }}
                                  required
                                />
                                <TextField
                                  label="Preço efetivo de encerramento"
                                  value={closeValues[leg.id]?.actualClosingPrice ?? ""}
                                  onChange={(event) => updateCloseValue(leg.id, "actualClosingPrice", event.target.value)}
                                  inputProps={{ inputMode: "decimal" }}
                                  required
                                />
                              </Stack>
                            </Box>
                          ))}
                      </Stack>
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setClosingStrategy(null)}>Cancelar</Button>
                      <Button
                        variant="contained"
                        onClick={() => void saveStrategyClose()}
                        disabled={saving || strategy.operations
                          .filter((leg) => leg.openQuantity > 0)
                          .some((leg) => !closeValues[leg.id]?.closedAt || !closeValues[leg.id]?.actualClosingPrice.trim())}
                      >
                        {saving ? "Encerrando..." : "Confirmar encerramento"}
                      </Button>
                    </DialogActions>
                  </Dialog>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      {creating && (
        <StrategyForm
          value={form}
          saving={saving}
          onChange={setForm}
          onSubmit={() => void save()}
          onClose={() => setCreating(false)}
        />
      )}
    </Box>
  );
}
