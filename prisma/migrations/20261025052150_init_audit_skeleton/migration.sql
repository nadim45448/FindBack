-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventNumber" INTEGER,
    "eventType" TEXT NOT NULL,
    "parentType" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "actingAdministratorId" TEXT,
    "determinedByUserId" TEXT,
    "recordedByAdministratorId" TEXT,
    "reason" TEXT,
    "previousValues" JSONB,
    "changedFields" JSONB,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditReadLog" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "query" TEXT,
    "filters" JSONB,
    "resultCount" INTEGER,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditReadLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_parentType_parentId_occurredAt_idx" ON "AuditEvent"("parentType", "parentId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_eventNumber_idx" ON "AuditEvent"("eventNumber");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditReadLog_administratorId_readAt_idx" ON "AuditReadLog"("administratorId", "readAt" DESC);
