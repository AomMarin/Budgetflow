-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "budgets" ALTER COLUMN "periodYear" SET DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int,
ALTER COLUMN "periodMonth" SET DEFAULT EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "budgetSessionId" TEXT;

-- CreateTable
CREATE TABLE "budget_sessions" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "allocatedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "spentAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "rolloverPolicy" "RolloverPolicy" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_sessions_budgetId_status_idx" ON "budget_sessions"("budgetId", "status");

-- CreateIndex
CREATE INDEX "budget_sessions_userId_periodYear_periodMonth_idx" ON "budget_sessions"("userId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "budget_sessions_budgetId_periodYear_periodMonth_key" ON "budget_sessions"("budgetId", "periodYear", "periodMonth");

-- CreateIndex
-- Hand-added: Prisma has no partial-unique-index syntax. Enforces "exactly
-- one OPEN session per budget" at the DB level — the app-level lazy-close
-- logic is expected to maintain this, but a bug in that logic should fail
-- loudly (constraint violation) instead of silently (two "current" rows,
-- invariant math reading the wrong one).
CREATE UNIQUE INDEX "budget_sessions_one_open_per_budget" ON "budget_sessions"("budgetId") WHERE "status" = 'OPEN';

-- CreateIndex
CREATE INDEX "transactions_budgetSessionId_idx" ON "transactions"("budgetSessionId");

-- AddForeignKey
ALTER TABLE "budget_sessions" ADD CONSTRAINT "budget_sessions_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_sessions" ADD CONSTRAINT "budget_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budgetSessionId_fkey" FOREIGN KEY ("budgetSessionId") REFERENCES "budget_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
