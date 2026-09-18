-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OptionType" AS ENUM ('CALL', 'PUT');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "Operation" (
    "id" UUID NOT NULL,
    "asset" TEXT NOT NULL,
    "optionTicker" TEXT NOT NULL,
    "optionType" "OptionType" NOT NULL,
    "side" "Side" NOT NULL,
    "expirationDate" DATE NOT NULL,
    "strike" DECIMAL(18,6) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "openedAt" DATE NOT NULL,
    "entryPremium" DECIMAL(18,6) NOT NULL,
    "simulatedClosingPrice" DECIMAL(18,6) NOT NULL,
    "closedAt" DATE,
    "actualClosingPrice" DECIMAL(18,6),
    "strategyId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "type" TEXT,
    "openedAt" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetQuote" (
    "id" UUID NOT NULL,
    "asset" TEXT NOT NULL,
    "price" DECIMAL(18,6),
    "timestamp" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "delayed" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Operation_asset_idx" ON "Operation"("asset");

-- CreateIndex
CREATE INDEX "Operation_strategyId_idx" ON "Operation"("strategyId");

-- CreateIndex
CREATE INDEX "Operation_expirationDate_idx" ON "Operation"("expirationDate");

-- CreateIndex
CREATE INDEX "Operation_closedAt_idx" ON "Operation"("closedAt");

-- CreateIndex
CREATE INDEX "Operation_optionType_idx" ON "Operation"("optionType");

-- CreateIndex
CREATE INDEX "Operation_side_idx" ON "Operation"("side");

-- CreateIndex
CREATE UNIQUE INDEX "AssetQuote_asset_key" ON "AssetQuote"("asset");

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
