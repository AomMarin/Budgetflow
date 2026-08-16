-- CreateEnum
CREATE TYPE "RolloverPolicy" AS ENUM ('RESET', 'ROLLOVER', 'SWEEP');

-- AlterTable: additive only, all four columns have defaults so existing rows backfill in place
ALTER TABLE "budgets" ADD COLUMN "rolloverPolicy" "RolloverPolicy" NOT NULL DEFAULT 'RESET';
ALTER TABLE "budgets" ADD COLUMN "monthlyTarget" DECIMAL(15,2);
ALTER TABLE "budgets" ADD COLUMN "periodYear" INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int;
ALTER TABLE "budgets" ADD COLUMN "periodMonth" INTEGER NOT NULL DEFAULT EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int;

-- CreateTable
CREATE TABLE "budget_monthly_history" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "allocatedAmount" DECIMAL(15,2) NOT NULL,
    "spentAmount" DECIMAL(15,2) NOT NULL,
    "rolloverPolicy" "RolloverPolicy" NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_monthly_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_monthly_history_budgetId_year_month_key" ON "budget_monthly_history"("budgetId", "year", "month");

-- CreateIndex
CREATE INDEX "budget_monthly_history_userId_year_month_idx" ON "budget_monthly_history"("userId", "year", "month");

-- AddForeignKey
ALTER TABLE "budget_monthly_history" ADD CONSTRAINT "budget_monthly_history_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_monthly_history" ADD CONSTRAINT "budget_monthly_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
