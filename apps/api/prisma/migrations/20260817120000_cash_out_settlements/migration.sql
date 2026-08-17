-- A CashOutSettlement is an admin's attestation that a real-world transfer
-- for a cash-out request (WalletTransaction.type = 'cash_out') happened
-- outside the app. It never touches WalletTransaction — see the model's
-- doc comment in schema.prisma.

CREATE TABLE "CashOutSettlement" (
  "id" TEXT NOT NULL,
  "walletTransactionId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CashOutSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashOutSettlement_walletTransactionId_key" ON "CashOutSettlement"("walletTransactionId");

ALTER TABLE "CashOutSettlement"
  ADD CONSTRAINT "CashOutSettlement_walletTransactionId_fkey"
  FOREIGN KEY ("walletTransactionId") REFERENCES "WalletTransaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
