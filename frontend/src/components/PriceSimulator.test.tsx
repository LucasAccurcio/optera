import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode, InputHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Operation } from "../types/operations";

vi.mock("@mui/material", async () => {
  const React = await import("react");
  const container = ({ children }: { children?: ReactNode }) =>
    React.createElement("div", null, children);
  return {
    Box: container,
    Button: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) =>
      React.createElement("button", { disabled }, children),
    Chip: ({ label }: { label: string }) => React.createElement("span", null, label),
    Slider: ({ value }: { value: number }) => React.createElement("input", { type: "range", value, readOnly: true }),
    Stack: container,
    TextField: ({
      label,
      value,
      inputProps,
    }: {
      label: string;
      value: string;
      inputProps?: InputHTMLAttributes<HTMLInputElement>;
    }) => React.createElement(
      "label",
      null,
      label,
      React.createElement("input", { ...inputProps, value, readOnly: true }),
    ),
    Typography: container,
  };
});

vi.mock("@mui/icons-material/SaveOutlined", () => ({
  default: () => null,
}));

import { PriceSimulator } from "./PriceSimulator";

const partialOperation: Operation = {
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

describe("PriceSimulator", () => {
  it("calculates simulated P&L on only the remaining quantity", () => {
    const markup = renderToStaticMarkup(
      <PriceSimulator operation={partialOperation} onSave={async () => undefined} />,
    );

    expect(markup).toContain("36,00");
    expect(markup).not.toContain("60,00");
  });
});
