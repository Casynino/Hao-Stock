-- 24h return window: pending returns auto-expire
ALTER TYPE "ReturnStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
