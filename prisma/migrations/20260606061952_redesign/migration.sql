-- CreateTable
CREATE TABLE "MonthlyPL" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenueBudget" INTEGER NOT NULL DEFAULT 0,
    "revenueFaceVal" INTEGER NOT NULL DEFAULT 0,
    "bankBalance" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "revenueActual" INTEGER NOT NULL DEFAULT 0,
    "procurementTotal" INTEGER NOT NULL DEFAULT 0,
    "payrollTotal" INTEGER NOT NULL DEFAULT 0,
    "fixedTotal" INTEGER NOT NULL DEFAULT 0,
    "operatingTotal" INTEGER NOT NULL DEFAULT 0,
    "centralTotal" INTEGER NOT NULL DEFAULT 0,
    "nonOperatingTotal" INTEGER NOT NULL DEFAULT 0,
    "shareholderTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "monthlyPLId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LineItem_monthlyPLId_fkey" FOREIGN KEY ("monthlyPLId") REFERENCES "MonthlyPL" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "defaultSalaryCents" INTEGER NOT NULL DEFAULT 0,
    "defaultHourlyCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "salaryCents" INTEGER NOT NULL DEFAULT 0,
    "hourlyCents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "payrollEntryId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL DEFAULT 0,
    "endMin" INTEGER NOT NULL DEFAULT 0,
    "breakMin" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Shift_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnnualPLLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "m1" BIGINT NOT NULL DEFAULT 0,
    "m2" BIGINT NOT NULL DEFAULT 0,
    "m3" BIGINT NOT NULL DEFAULT 0,
    "m4" BIGINT NOT NULL DEFAULT 0,
    "m5" BIGINT NOT NULL DEFAULT 0,
    "m6" BIGINT NOT NULL DEFAULT 0,
    "m7" BIGINT NOT NULL DEFAULT 0,
    "m8" BIGINT NOT NULL DEFAULT 0,
    "m9" BIGINT NOT NULL DEFAULT 0,
    "m10" BIGINT NOT NULL DEFAULT 0,
    "m11" BIGINT NOT NULL DEFAULT 0,
    "m12" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "isSubtotal" BOOLEAN NOT NULL DEFAULT false,
    "indent" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPL_year_month_key" ON "MonthlyPL"("year", "month");

-- CreateIndex
CREATE INDEX "LineItem_monthlyPLId_category_idx" ON "LineItem"("monthlyPLId", "category");

-- CreateIndex
CREATE INDEX "Supplier_year_month_idx" ON "Supplier"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_name_key" ON "Employee"("name");

-- CreateIndex
CREATE INDEX "PayrollEntry_year_month_idx" ON "PayrollEntry"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEntry_year_month_employeeId_key" ON "PayrollEntry"("year", "month", "employeeId");

-- CreateIndex
CREATE INDEX "Shift_payrollEntryId_idx" ON "Shift"("payrollEntryId");

-- CreateIndex
CREATE INDEX "AnnualPLLine_year_idx" ON "AnnualPLLine"("year");
