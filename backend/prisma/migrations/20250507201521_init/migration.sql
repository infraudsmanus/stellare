-- CreateTable
CREATE TABLE "UploadJob" (
    "id" TEXT NOT NULL,
    "originalZipName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "htmlContent" TEXT,
    "mappingJson" JSONB,

    CONSTRAINT "UploadJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedFile" (
    "id" TEXT NOT NULL,
    "uploadJobId" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "s3Path" TEXT NOT NULL,
    "md5Hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingLog" (
    "id" TEXT NOT NULL,
    "uploadJobId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',

    CONSTRAINT "ProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedFile_s3Path_key" ON "ProcessedFile"("s3Path");

-- CreateIndex
CREATE INDEX "ProcessedFile_uploadJobId_idx" ON "ProcessedFile"("uploadJobId");

-- CreateIndex
CREATE INDEX "ProcessingLog_uploadJobId_idx" ON "ProcessingLog"("uploadJobId");

-- AddForeignKey
ALTER TABLE "ProcessedFile" ADD CONSTRAINT "ProcessedFile_uploadJobId_fkey" FOREIGN KEY ("uploadJobId") REFERENCES "UploadJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingLog" ADD CONSTRAINT "ProcessingLog_uploadJobId_fkey" FOREIGN KEY ("uploadJobId") REFERENCES "UploadJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
