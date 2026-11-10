-- DropIndex
DROP INDEX "Message_conversationId_idx";

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_providerUserId_idx" ON "Conversation"("providerUserId");
