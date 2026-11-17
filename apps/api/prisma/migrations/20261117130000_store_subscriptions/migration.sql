-- CreateTable
CREATE TABLE "StoreSubscription" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "autoRenewing" BOOLEAN NOT NULL DEFAULT false,
    "latestOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreSubscription_externalId_key" ON "StoreSubscription"("externalId");

-- CreateIndex
CREATE INDEX "StoreSubscription_agentId_idx" ON "StoreSubscription"("agentId");

-- CreateIndex
CREATE INDEX "StoreSubscription_userId_idx" ON "StoreSubscription"("userId");
