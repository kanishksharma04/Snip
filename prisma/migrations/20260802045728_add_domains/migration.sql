-- AlterTable
ALTER TABLE "Link" ADD COLUMN     "domainId" TEXT;

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");

-- CreateIndex
CREATE INDEX "Domain_userId_idx" ON "Domain"("userId");

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
