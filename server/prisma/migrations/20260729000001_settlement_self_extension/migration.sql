-- Rep self-extension: +96h after the original 72h window, with higher penalties
ALTER TABLE "settlements" ADD COLUMN "selfExtendedAt" TIMESTAMP(3);
ALTER TABLE "settlements" ADD COLUMN "selfExtendedById" TEXT;
ALTER TABLE "settlements" ADD COLUMN "preExtensionDeadline" TIMESTAMP(3);
