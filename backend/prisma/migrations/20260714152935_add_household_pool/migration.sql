-- AlterTable
ALTER TABLE "households" ADD COLUMN     "poolUserId" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "linkedTransactionId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isPoolAccount" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "households_poolUserId_key" ON "households"("poolUserId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_linkedTransactionId_key" ON "transactions"("linkedTransactionId");

-- CreateIndex
CREATE INDEX "transactions_actorUserId_idx" ON "transactions"("actorUserId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_linkedTransactionId_fkey" FOREIGN KEY ("linkedTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_poolUserId_fkey" FOREIGN KEY ("poolUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

