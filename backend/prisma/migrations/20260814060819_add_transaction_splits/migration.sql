-- CreateTable
CREATE TABLE "transaction_splits" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_splits_transactionId_budgetId_key" ON "transaction_splits"("transactionId", "budgetId");

-- CreateIndex
CREATE INDEX "transaction_splits_budgetId_idx" ON "transaction_splits"("budgetId");

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
