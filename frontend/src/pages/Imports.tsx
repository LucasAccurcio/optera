import { useState } from "react";
import { Alert, Box, Button, Card, CardContent, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { importOperations } from "../services/api/client";
import type { ImportReport } from "../types/imports";

export function Imports() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try { setReport(await importOperations(file, "preview")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível validar o arquivo."); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (!file || !report || report.rejected > 0) return;
    setBusy(true); setError(null);
    try { setReport(await importOperations(file, "commit")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível importar o arquivo."); }
    finally { setBusy(false); }
  };

  return <Box><Box sx={{ mb: 3 }}><Typography variant="h4">Importar planilha</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>Valide as operações antes de gravá-las no sistema.</Typography></Box>
    <Card sx={{ border: "1px solid", borderColor: "divider", backgroundImage: "none" }}><CardContent><Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={2}><Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />}>Selecionar XLSX<input hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setReport(null); setError(null); }} /></Button><Typography color="text.secondary">{file?.name ?? "Nenhum arquivo selecionado"}</Typography><Button variant="contained" disabled={!file || busy} onClick={() => void preview()}>{busy ? "Validando..." : "Validar arquivo"}</Button></Stack></CardContent></Card>
    {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>{error}</Alert>}
    {report && <Card sx={{ mt: 2, border: "1px solid", borderColor: "divider", backgroundImage: "none" }}><CardContent><Stack direction={{ xs: "column", sm: "row" }} spacing={3}><Box><Typography variant="caption" color="text.secondary">Prontas para importar</Typography><Typography variant="h5" color="success.main">{report.imported}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Ignoradas</Typography><Typography variant="h5">{report.ignored}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Rejeitadas</Typography><Typography variant="h5" color={report.rejected ? "error.main" : "text.primary"}>{report.rejected}</Typography></Box></Stack>
      {report.errors.length > 0 && <><Divider sx={{ my: 2 }} /><Typography variant="subtitle2">Erros encontrados</Typography><Stack spacing={.5} sx={{ mt: 1 }}>{report.errors.map((item) => <Typography key={`${item.row}-${item.reason}`} variant="body2" color="error.main">Linha {item.row}: {item.reason}</Typography>)}</Stack></>}
      <Divider sx={{ my: 2 }} /><Typography variant="subtitle2">Prévia</Typography>{report.preview.length === 0 ? <Typography color="text.secondary" sx={{ mt: 1 }}>Nenhuma linha válida para importar.</Typography> : <Box sx={{ overflowX: "auto", mt: 1 }}><Table size="small"><TableHead><TableRow><TableCell>Linha</TableCell><TableCell>Operação</TableCell><TableCell>Tipo</TableCell><TableCell>Qtd.</TableCell><TableCell>Prêmio</TableCell><TableCell>Estado</TableCell></TableRow></TableHead><TableBody>{report.preview.map((item) => <TableRow key={item.row}><TableCell>{item.row}</TableCell><TableCell>{item.operation.asset} · {item.operation.optionTicker}</TableCell><TableCell>{item.operation.optionType} · {item.operation.side === "BUY" ? "Compra" : "Venda"}</TableCell><TableCell>{item.operation.quantity}</TableCell><TableCell>R$ {item.operation.entryPremium}</TableCell><TableCell>{item.operation.closedAt ? "Encerrada" : "Aberta"}</TableCell></TableRow>)}</TableBody></Table></Box>}
      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}><Button variant="contained" color="success" startIcon={<CheckRoundedIcon />} disabled={busy || report.rejected > 0 || report.imported === 0 || report.committed} onClick={() => void commit()}>{report.committed ? "Importação concluída" : "Confirmar importação"}</Button></Stack>
    </CardContent></Card>}
  </Box>;
}
