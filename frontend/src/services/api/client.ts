import type {
  Operation,
  OperationFilters,
  OperationInput,
  QuoteResponse,
} from "../../types/operations";
import type { Strategy, StrategyInput } from "../../types/strategies";
import type { Summary } from "../../types/summary";
import type { ImportReport } from "../../types/imports";

export type HealthResponse = {
  status: string;
  environment: string;
  database: string;
};
export type OperationListResponse = {
  data: Operation[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
export type { QuoteResponse } from "../../types/operations";

const baseUrl = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export function normalizeDecimalInput(value: string): string {
  return value.trim().replace(",", ".");
}

function normalizeOperationInput(input: OperationInput): OperationInput {
  return {
    ...input,
    strike: normalizeDecimalInput(input.strike),
    entryPremium: normalizeDecimalInput(input.entryPremium),
  };
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`API indisponível (${response.status})`);
  return response.json() as Promise<HealthResponse>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body == null ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new Error(
      body?.error?.message ?? `API indisponível (${response.status})`,
    );
  return (body?.data ?? body) as T;
}

async function requestEnvelope<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body == null ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    ({ error?: { message?: string } } & T) | null;
  if (!response.ok)
    throw new Error(
      body && "error" in body
        ? (body.error?.message ?? `API indisponível (${response.status})`)
        : `API indisponível (${response.status})`,
    );
  return body as T;
}

export async function getOperations(
  filters: OperationFilters,
): Promise<OperationListResponse> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "100",
    sortBy: "expirationDate",
    sortOrder: "asc",
  });
  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.asset) params.set("asset", filters.asset);
  if (filters.optionType) params.set("optionType", filters.optionType);
  if (filters.side) params.set("side", filters.side);
  if (filters.strategyId) params.set("strategyId", filters.strategyId);
  return requestEnvelope<OperationListResponse>(`/operations?${params}`);
}

export function getAvailableOperationsForStrategy() {
  return requestEnvelope<OperationListResponse>(
    "/operations/available-for-strategy",
  );
}

export function createOperation(input: OperationInput) {
  return request<Operation>("/operations", {
    method: "POST",
    body: JSON.stringify(normalizeOperationInput(input)),
  });
}

export function updateOperation(id: string, input: Partial<OperationInput>) {
  const normalizedInput = {
    ...input,
    ...(input.strike === undefined
      ? {}
      : { strike: normalizeDecimalInput(input.strike) }),
    ...(input.entryPremium === undefined
      ? {}
      : { entryPremium: normalizeDecimalInput(input.entryPremium) }),
  };
  return request<Operation>(`/operations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(normalizedInput),
  });
}

export function updateSimulation(id: string, simulatedClosingPrice: string) {
  return request<Operation>(`/operations/${id}/simulation`, {
    method: "PATCH",
    body: JSON.stringify({
      simulatedClosingPrice: normalizeDecimalInput(simulatedClosingPrice),
    }),
  });
}

export function closeOperation(
  id: string,
  closedAt: string,
  actualClosingPrice: string,
) {
  return request<Operation>(`/operations/${id}/close`, {
    method: "POST",
    body: JSON.stringify({
      closedAt,
      actualClosingPrice: normalizeDecimalInput(actualClosingPrice),
    }),
  });
}

export function deleteOperation(id: string) {
  return request<void>(`/operations/${id}`, { method: "DELETE" });
}

export function getStrategies() {
  return request<Strategy[]>("/strategies");
}

export function createStrategy(input: StrategyInput) {
  return request<Strategy>("/strategies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteStrategy(id: string) {
  return request<void>(`/strategies/${id}`, { method: "DELETE" });
}

export function addStrategyOperation(strategyId: string, operationId: string) {
  return request<Strategy>(`/strategies/${strategyId}/operations`, {
    method: "POST",
    body: JSON.stringify({ operationId }),
  });
}

export function removeStrategyOperation(
  strategyId: string,
  operationId: string,
) {
  return request<Strategy>(
    `/strategies/${strategyId}/operations/${operationId}`,
    { method: "DELETE" },
  );
}

export function getSummary() {
  return request<Summary>("/summary");
}

export function getQuotes(): Promise<QuoteResponse> {
  return requestEnvelope<QuoteResponse>("/quotes");
}

export function refreshQuotes(): Promise<QuoteResponse> {
  return requestEnvelope<QuoteResponse>("/quotes/refresh", { method: "POST" });
}

export async function importOperations(file: File, mode: "preview" | "commit") {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${baseUrl}/imports/operations?mode=${mode}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: formData,
  });
  const body = (await response.json().catch(() => null)) as { data?: ImportReport; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `API indisponível (${response.status})`);
  return body?.data as ImportReport;
}
