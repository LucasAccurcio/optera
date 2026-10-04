import { renderToStaticMarkup } from "react-dom/server";
import type { InputHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Operation } from "../types/operations";

vi.mock("@mui/material", async () => {
  const React = await import("react");
  const container = ({ children }: { children?: ReactNode }) =>
    React.createElement("div", null, children);
  return {
    Alert: container,
    Button: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) =>
      React.createElement("button", { disabled }, children),
    Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? React.createElement("div", { role: "dialog" }, children) : null,
    DialogActions: container,
    DialogContent: container,
    DialogTitle: ({ children }: { children?: ReactNode }) =>
      React.createElement("h2", null, children),
    Stack: container,
    TextField: ({
      label,
      value,
      type,
      inputProps,
    }: {
      label: string;
      value: string | number;
      type?: string;
      inputProps?: InputHTMLAttributes<HTMLInputElement>;
    }) => React.createElement(
      "label",
      null,
      label,
      React.createElement("input", { ...inputProps, type, value, readOnly: true }),
    ),
    Typography: container,
  };
});

import { OperationCloseDialog } from "./OperationCloseDialog";

const operation: Operation = {
  id: "operation-1",
  asset: "BBSE3",
  optionTicker: "BBSEV436",
  optionType: "PUT",
  side: "SELL",
  expirationDate: "2026-12-18",
  strike: "40",
  quantity: 100,
  closedQuantity: 40,
  openQuantity: 60,
  openedAt: "2026-01-10",
  entryPremium: "1",
  simulatedClosingPrice: "0.4",
  closures: [],
  strategyId: null,
  notes: null,
  status: "PARTIALLY_CLOSED",
  totalPremium: "100",
  realizedResult: "20",
  estimatedOpenResult: "36",
  result: "56",
  resultPercentage: "0.56",
  createdAt: "2026-01-10T00:00:00.000Z",
  updatedAt: "2026-01-10T00:00:00.000Z",
};

describe("OperationCloseDialog", () => {
  it("defaults to the remaining quantity and keeps simulated price editable", () => {
    const markup = renderToStaticMarkup(
      <OperationCloseDialog
        operation={operation}
        onClose={() => undefined}
        onSubmit={async () => undefined}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Quantidade a encerrar");
    expect(markup).toContain('value="60"');
    expect(markup).toContain('value="0.4"');
    expect(markup).toContain("Preço efetivo de encerramento");
  });
});
