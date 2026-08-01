-- CreateTable
CREATE TABLE "PromoBanner" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoBanner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoBanner_active_idx" ON "PromoBanner"("active");
