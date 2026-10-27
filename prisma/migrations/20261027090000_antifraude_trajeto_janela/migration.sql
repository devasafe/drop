-- Janela de 3 s por ponto do caminho: no máximo um ponto por janela por corrida (garantido pelo banco).
ALTER TABLE "DeliveryTrackPoint" ADD COLUMN "bucket" INTEGER;
UPDATE "DeliveryTrackPoint" SET "bucket" = floor(extract(epoch from "createdAt") / 3)::int;
-- Pontos antigos na mesma janela: fica o primeiro.
DELETE FROM "DeliveryTrackPoint" a USING "DeliveryTrackPoint" b
  WHERE a."deliveryId" = b."deliveryId" AND a."bucket" = b."bucket" AND a."id" > b."id";
ALTER TABLE "DeliveryTrackPoint" ALTER COLUMN "bucket" SET NOT NULL;
CREATE UNIQUE INDEX "DeliveryTrackPoint_deliveryId_bucket_key" ON "DeliveryTrackPoint"("deliveryId", "bucket");
