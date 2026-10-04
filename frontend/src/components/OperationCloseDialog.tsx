import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Operation, OperationCloseInput } from "../types/operations";

export interface OperationCloseDialogProps {
  operation: Operation;
  onClose: () => void;
  onSubmit: (input: OperationCloseInput) => Promise<void>;
  saving?: boolean;
  error?: string | null;
}

export function OperationCloseDialog({
  operation,
  onClose,
  onSubmit,
  saving = false,
  error = null,
}: OperationCloseDialogProps) {
  const [quantity, setQuantity] = useState(operation.openQuantity);
  const [closedAt, setClosedAt] = useState(new Date().toISOString().slice(0, 10));
  const [actualClosingPrice, setActualClosingPrice] = useState(
    operation.simulatedClosingPrice,
  );

  useEffect(() => {
    setQuantity(operation.openQuantity);
    setClosedAt(new Date().toISOString().slice(0, 10));
    setActualClosingPrice(operation.simulatedClosingPrice);
  }, [operation.id, operation.openQuantity, operation.simulatedClosingPrice]);

  const quantityValid = Number.isSafeInteger(quantity)
    && quantity > 0
    && quantity <= operation.openQuantity;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(closedAt);
  const priceValid = /^\d+(?:\.\d{1,6})?$/.test(actualClosingPrice);

  const submit = async () => {
    if (!quantityValid || !dateValid || !priceValid) return;
    await onSubmit({ quantity, closedAt, actualClosingPrice });
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Encerrar operação</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Informe a quantidade encerrada e o preço efetivo. O preço simulado da opção não será alterado.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Saldo aberto: {operation.openQuantity} de {operation.quantity}
        </Typography>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Quantidade a encerrar"
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            inputProps={{ min: 1, max: operation.openQuantity, step: 1 }}
            required
          />
          <TextField
            label="Data de encerramento"
            type="date"
            value={closedAt}
            onChange={(event) => setClosedAt(event.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            label="Preço efetivo de encerramento"
            value={actualClosingPrice}
            onChange={(event) => setActualClosingPrice(event.target.value)}
            inputProps={{ inputMode: "decimal" }}
            required
          />
        </Stack>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={saving || !quantityValid || !dateValid || !priceValid}
        >
          {saving ? "Encerrando..." : "Confirmar encerramento"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
