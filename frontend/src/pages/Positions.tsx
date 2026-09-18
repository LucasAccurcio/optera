import { useEffect, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  closeOperation,
  createOperation,
  deleteOperation,
  getOperations,
  updateOperation,
  updateSimulation,
} from "../services/api/client";
import type {
  Operation,
  OperationFilters,
  OperationInput,
  OperationSide,
  OptionType,
} from "../types/operations";
import { PriceSimulator } from "../components/PriceSimulator";

const emptyFilters: OperationFilters = {
  status: "OPEN",
  asset: "",
  optionType: "",
  side: "",
  strategyId: "",
};
const emptyForm: OperationInput = {
  asset: "",
  optionTicker: "",
  optionType: "CALL",
  side: "BUY",
  expirationDate: "",
  strike: "",
  quantity: 1,
  openedAt: new Date().toISOString().slice(0, 10),
  entryPremium: "",
  strategyId: null,
  notes: null,
};
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const formatCurrency = (value: string) => currency.format(Number(value));

function formFromOperation(operation: Operation): OperationInput {
  return {
    asset: operation.asset,
    optionTicker: operation.optionTicker,
    optionType: operation.optionType,
    side: operation.side,
    expirationDate: operation.expirationDate,
    strike: operation.strike,
    quantity: operation.quantity,
    openedAt: operation.openedAt,
    entryPremium: operation.entryPremium,
    strategyId: operation.strategyId,
    notes: operation.notes,
  };
}

function OperationForm({
  value,
  editing,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  value: OperationInput;
  editing: boolean;
  saving: boolean;
  onChange: (value: OperationInput) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const update = (field: keyof OperationInput, next: string | number | null) =>
    onChange({ ...value, [field]: next });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? "Editar operação" : "Nova operação"}</DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
            pt: 1,
          }}
        >
          <TextField
            label="Ativo"
            value={value.asset}
            onChange={(e) => update("asset", e.target.value)}
            required
          />
          <TextField
            label="Ticker da opção"
            value={value.optionTicker}
            onChange={(e) => update("optionTicker", e.target.value)}
            required
          />
          <FormControl>
            <InputLabel>Tipo</InputLabel>
            <Select
              label="Tipo"
              value={value.optionType}
              onChange={(e) =>
                update("optionType", e.target.value as OptionType)
              }
            >
              <MenuItem value="CALL">CALL</MenuItem>
              <MenuItem value="PUT">PUT</MenuItem>
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel>Operação</InputLabel>
            <Select
              label="Operação"
              value={value.side}
              onChange={(e) => update("side", e.target.value as OperationSide)}
            >
              <MenuItem value="BUY">Compra</MenuItem>
              <MenuItem value="SELL">Venda</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Vencimento"
            type="date"
            value={value.expirationDate}
            onChange={(e) => update("expirationDate", e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            label="Abertura"
            type="date"
            value={value.openedAt}
            onChange={(e) => update("openedAt", e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            label="Strike"
            value={value.strike}
            onChange={(e) => update("strike", e.target.value)}
            inputProps={{ inputMode: "decimal" }}
            required
          />
          <TextField
            label="Prêmio"
            value={value.entryPremium}
            onChange={(e) => update("entryPremium", e.target.value)}
            inputProps={{ inputMode: "decimal" }}
            required
          />
          <TextField
            label="Quantidade"
            type="number"
            value={value.quantity}
            onChange={(e) => update("quantity", Number(e.target.value))}
            inputProps={{ min: 1, step: 1 }}
            required
          />
          <TextField
            label="Estratégia (ID)"
            value={value.strategyId ?? ""}
            onChange={(e) => update("strategyId", e.target.value || null)}
          />
          <TextField
            label="Observações"
            value={value.notes ?? ""}
            onChange={(e) => update("notes", e.target.value || null)}
            multiline
            minRows={2}
            sx={{ gridColumn: { sm: "1 / -1" } }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={onSubmit} disabled={saving}>
          {saving
            ? "Salvando..."
            : editing
              ? "Salvar alterações"
              : "Criar operação"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function OperationCard({
  operation,
  onEdit,
  onDelete,
  onSimulation,
  onClose,
  savingSimulation,
}: {
  operation: Operation;
  onEdit: () => void;
  onDelete: () => void;
  onSimulation: (price: string) => Promise<void>;
  onClose: () => void;
  savingSimulation: boolean;
}) {
  const positive = Number(operation.result) >= 0;
  return (
    <Card
      sx={{
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        backgroundImage: "none",
      }}
    >
      <CardContent
        sx={{ p: { xs: 2, md: 3 }, "&:last-child": { pb: { xs: 2, md: 3 } } }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          gap={1.5}
          justifyContent="space-between"
          alignItems={{ sm: "flex-start" }}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {operation.asset}
              </Typography>
              <Typography color="text.secondary">
                {operation.optionTicker}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {operation.optionType} ·{" "}
              {operation.side === "BUY" ? "Compra" : "Venda"} ·{" "}
              {operation.quantity} opções
            </Typography>
          </Box>
          <Chip
            size="small"
            color={operation.status === "OPEN" ? "primary" : "default"}
            label={operation.status === "OPEN" ? "Aberta" : "Encerrada"}
          />
        </Stack>
        <Stack
          direction="row"
          flexWrap="wrap"
          gap={{ xs: 2, sm: 4 }}
          sx={{ mt: 2.5 }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              Strike
            </Typography>
            <Typography sx={{ fontWeight: 700 }}>
              {formatCurrency(operation.strike)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Prêmio
            </Typography>
            <Typography sx={{ fontWeight: 700 }}>
              {formatCurrency(operation.entryPremium)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Vencimento
            </Typography>
            <Typography sx={{ fontWeight: 700 }}>
              {operation.expirationDate}
            </Typography>
          </Box>
        </Stack>
        {operation.status === "OPEN" ? (
          <PriceSimulator
            operation={operation}
            saving={savingSimulation}
            onSave={onSimulation}
          />
        ) : (
          <Box
            sx={{
              mt: 3,
              p: 2,
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.03)",
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Resultado realizado
            </Typography>
            <Typography
              variant="h6"
              color={positive ? "success.main" : "error.main"}
            >
              {formatCurrency(operation.result)}{" "}
              <Typography component="span" variant="body2">
                ({(Number(operation.resultPercentage) * 100).toFixed(2)}%)
              </Typography>
            </Typography>
          </Box>
        )}
        <Divider sx={{ mt: 2.5, mb: 1.5 }} />
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button
            size="small"
            onClick={onClose}
            disabled={operation.status === "CLOSED"}
          >
            Encerrar
          </Button>
          <Button
            size="small"
            startIcon={<EditOutlinedIcon />}
            onClick={onEdit}
            disabled={operation.status === "CLOSED"}
          >
            Editar
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineRoundedIcon />}
            onClick={onDelete}
          >
            Excluir
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function Positions() {
  const [filters, setFilters] = useState(emptyFilters);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OperationInput>(emptyForm);
  const [editing, setEditing] = useState<Operation | null>(null);
  const [closing, setClosing] = useState<Operation | null>(null);
  const [closeDate, setCloseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [closePrice, setClosePrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getOperations(filters);
      setOperations(response.data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar as operações.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [filters]);
  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, openedAt: new Date().toISOString().slice(0, 10) });
  };
  const openEdit = (operation: Operation) => {
    setEditing(operation);
    setForm(formFromOperation(operation));
  };
  const saveForm = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) await updateOperation(editing.id, form);
      else await createOperation(form);
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar a operação.",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (operation: Operation) => {
    if (!window.confirm(`Excluir a operação ${operation.optionTicker}?`))
      return;
    try {
      await deleteOperation(operation.id);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível excluir a operação.",
      );
    }
  };
  const saveSimulation = async (operation: Operation, price: string) => {
    setSavingId(operation.id);
    try {
      const updated = await updateSimulation(operation.id, price);
      setOperations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar a simulação.",
      );
    } finally {
      setSavingId(null);
    }
  };
  const openClose = (operation: Operation) => {
    setClosing(operation);
    setCloseDate(new Date().toISOString().slice(0, 10));
    setClosePrice(operation.simulatedClosingPrice);
  };
  const saveClose = async () => {
    if (!closing) return;
    setSaving(true);
    try {
      const updated = await closeOperation(closing.id, closeDate, closePrice);
      setOperations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setClosing(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível encerrar a operação.",
      );
    } finally {
      setSaving(false);
    }
  };
  const updateFilter = <K extends keyof OperationFilters>(
    key: K,
    value: OperationFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));

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
          <Typography variant="h4">Posições</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Acompanhe suas operações e simule diferentes saídas.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={openCreate}
        >
          Nova operação
        </Button>
      </Stack>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={1.5}
        sx={{ mb: 3 }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={filters.status}
          onChange={(_, value) => value && updateFilter("status", value)}
        >
          <ToggleButton value="ALL">Todas</ToggleButton>
          <ToggleButton value="OPEN">Abertas</ToggleButton>
          <ToggleButton value="CLOSED">Encerradas</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          label="Ativo"
          value={filters.asset}
          onChange={(e) => updateFilter("asset", e.target.value)}
          sx={{ minWidth: 150 }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Tipo</InputLabel>
          <Select
            label="Tipo"
            value={filters.optionType}
            onChange={(e) =>
              updateFilter(
                "optionType",
                e.target.value as OperationFilters["optionType"],
              )
            }
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="CALL">CALL</MenuItem>
            <MenuItem value="PUT">PUT</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Operação</InputLabel>
          <Select
            label="Operação"
            value={filters.side}
            onChange={(e) =>
              updateFilter("side", e.target.value as OperationFilters["side"])
            }
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="BUY">Compra</MenuItem>
            <MenuItem value="SELL">Venda</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="ID da estratégia"
          value={filters.strategyId}
          onChange={(e) => updateFilter("strategyId", e.target.value)}
          sx={{ minWidth: 180 }}
        />
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {loading ? (
        <Stack spacing={2}>
          {[1, 2].map((item) => (
            <Skeleton key={item} variant="rounded" height={300} />
          ))}
        </Stack>
      ) : operations.length === 0 ? (
        <Card
          sx={{
            p: 5,
            textAlign: "center",
            border: "1px dashed",
            borderColor: "divider",
            backgroundImage: "none",
          }}
        >
          <Typography variant="h6">Nenhuma operação encontrada</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Ajuste os filtros ou cadastre sua primeira operação.
          </Typography>
        </Card>
      ) : (
        <Stack spacing={2}>
          {operations.map((operation) => (
            <OperationCard
              key={operation.id}
              operation={operation}
              onEdit={() => openEdit(operation)}
              onDelete={() => void remove(operation)}
              onSimulation={(price) => saveSimulation(operation, price)}
              onClose={() => openClose(operation)}
              savingSimulation={savingId === operation.id}
            />
          ))}
        </Stack>
      )}
      {editing !== null || form !== emptyForm ? (
        <OperationForm
          value={form}
          editing={editing !== null}
          saving={saving}
          onChange={setForm}
          onSubmit={() => void saveForm()}
          onClose={() => {
            setEditing(null);
            setForm(emptyForm);
          }}
        />
      ) : null}
      {closing && (
        <Dialog open onClose={() => setClosing(null)} fullWidth maxWidth="xs">
          <DialogTitle>Encerrar operação</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Informe o preço efetivo usado no encerramento. A simulação não
              será alterada.
            </Typography>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Data de encerramento"
                type="date"
                value={closeDate}
                onChange={(event) => setCloseDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
                required
              />
              <TextField
                label="Preço efetivo de encerramento"
                value={closePrice}
                onChange={(event) => setClosePrice(event.target.value)}
                inputProps={{ inputMode: "decimal" }}
                required
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setClosing(null)}>Cancelar</Button>
            <Button
              variant="contained"
              onClick={() => void saveClose()}
              disabled={saving || !closeDate || !closePrice}
            >
              {saving ? "Encerrando..." : "Confirmar encerramento"}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
