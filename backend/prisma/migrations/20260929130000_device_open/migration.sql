-- CreateTable
CREATE TABLE "DeviceOpen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "deviceName" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceOpen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeviceOpen_openedAt_idx" ON "DeviceOpen"("openedAt");
