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
  createStrategy,
  deleteStrategy,
  getAvailableOperationsForStrategy,
  getStrategies,
  removeStrategyOperation,
} from "../services/api/client";
import type { Operation } from "../types/operations";
import type { Strategy, StrategyInput } from "../types/strategies";

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

  const load = async () => {
    setLoading(true);
    try {
      const [strategyResponse, operationResponse] = await Promise.all([
        getStrategies(),
        getAvailableOperationsForStrategy(),
      ]);
      setStrategies(strategyResponse);
      setOperations(operationResponse.data);
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
                          strategy.status === "OPEN" ? "Aberta" : "Encerrada"
                        }
                        color={
                          strategy.status === "OPEN" ? "primary" : "default"
                        }
                      />
                    </Stack>
                    <Typography color="text.secondary" variant="body2">
                      {strategy.asset}
                      {strategy.type ? ` · ${strategy.type}` : ""} · abertura{" "}
                      {strategy.openedAt}
                    </Typography>
                  </Box>
                  <Button
                    color="error"
                    size="small"
                    startIcon={<DeleteOutlineRoundedIcon />}
                    onClick={() => void remove(strategy)}
                  >
                    Excluir
                  </Button>
                </Stack>
                <Stack
                  direction="row"
                  flexWrap="wrap"
                  gap={{ xs: 2, sm: 5 }}
                  sx={{ mt: 2.5 }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Prêmio total
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      {formatMoney(strategy.totalPremium)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Resultado consolidado
                    </Typography>
                    <Typography
                      sx={{ fontWeight: 700 }}
                      color={
                        Number(strategy.result) >= 0
                          ? "success.main"
                          : "error.main"
                      }
                    >
                      {formatMoney(strategy.result)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Percentual
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      {(Number(strategy.resultPercentage) * 100).toFixed(2)}%
                    </Typography>
                  </Box>
                </Stack>
                <Divider sx={{ my: 2 }} />
                {strategy.operations.length === 0 ? (
                  <Typography color="text.secondary">
                    Nenhuma perna associada.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {strategy.operations.map((leg) => (
                      <Stack
                        key={leg.id}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
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
                            {leg.optionType} ·{" "}
                            {leg.side === "BUY" ? "Compra" : "Venda"} ·{" "}
                            {leg.quantity} opções ·{" "}
                            {leg.status === "OPEN" ? "simulado" : "realizado"}
                          </Typography>
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography
                            color={
                              Number(leg.result) >= 0
                                ? "success.main"
                                : "error.main"
                            }
                          >
                            {formatMoney(leg.result)}
                          </Typography>
                          <Button
                            aria-label={`Remover ${leg.optionTicker}`}
                            size="small"
                            color="inherit"
                            onClick={() => void removeLeg(strategy, leg.id)}
                          >
                            <RemoveCircleOutlineRoundedIcon fontSize="small" />
                          </Button>
                        </Stack>
                      </Stack>
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
