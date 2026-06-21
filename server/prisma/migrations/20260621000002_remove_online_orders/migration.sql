-- Remove the Online Orders feature entirely.
-- The Lab takes no online orders — all orders come from sales reps. Dropping the
-- tables also drops their foreign keys to customers / warehouses / products /
-- packaging units / users.

DROP TABLE IF EXISTS "online_order_items";
DROP TABLE IF EXISTS "online_orders";
DROP TYPE IF EXISTS "OnlineOrderStatus";
DROP TYPE IF EXISTS "OrderPaymentStatus";
