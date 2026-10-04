DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Operation"
    WHERE ("closedAt" IS NULL) <> ("actualClosingPrice" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot migrate Operation closures: closedAt and actualClosingPrice must either both be NULL or both be populated';
  END IF;
END $$;

CREATE TABLE "OperationClosure" (
    "id" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "actualClosingPrice" DECIMAL(18,6) NOT NULL,
    "closedAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationClosure_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OperationClosure" (
    "id",
    "operationId",
    "quantity",
    "actualClosingPrice",
    "closedAt"
)
SELECT
    gen_random_uuid(),
    "id",
    "quantity",
    "actualClosingPrice",
    "closedAt"
FROM "Operation"
WHERE "closedAt" IS NOT NULL;

DROP INDEX "Operation_closedAt_idx";

ALTER TABLE "Operation"
    DROP COLUMN "closedAt",
    DROP COLUMN "actualClosingPrice";

CREATE INDEX "OperationClosure_operationId_closedAt_idx"
    ON "OperationClosure"("operationId", "closedAt");

ALTER TABLE "OperationClosure"
    ADD CONSTRAINT "OperationClosure_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "Operation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
