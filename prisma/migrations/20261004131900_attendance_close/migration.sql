-- AlterTable
ALTER TABLE "DailyAttendance" ADD COLUMN     "autoCreated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AttendanceDayClose" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceDayClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceDayClose_projectId_date_idx" ON "AttendanceDayClose"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDayClose_projectId_date_key" ON "AttendanceDayClose"("projectId", "date");

-- AddForeignKey
ALTER TABLE "AttendanceDayClose" ADD CONSTRAINT "AttendanceDayClose_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
