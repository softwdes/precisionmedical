-- Drop unused tables (no references anywhere in the codebase)
-- Order matters: dependent tables first if there are FKs

DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS subscription_payments CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS daily_checkins CASCADE;
