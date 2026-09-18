import fp from "fastify-plugin";
import multipart from "@fastify/multipart";
import { AppError } from "../../shared/errors.js";
import { ImportService } from "./service.js";

export default fp(async (app: any) => {
  await app.register(multipart, {
    limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 1 },
  });
  app.post("/imports/operations", async (request: any) => {
    const mode = request.query?.mode ?? "preview";
    if (mode !== "preview" && mode !== "commit")
      throw new AppError("VALIDATION_ERROR", "mode must be preview or commit");
    const file = await request.file();
    if (!file) throw new AppError("INVALID_FILE", "An XLSX file is required");
    if (!file.filename.toLowerCase().endsWith(".xlsx"))
      throw new AppError("INVALID_FILE", "Only .xlsx files are supported");
    const buffer = await file.toBuffer();
    const service = new ImportService(app.prisma);
    return {
      data:
        mode === "commit"
          ? await service.commit(buffer)
          : await service.preview(buffer),
    };
  });
});
