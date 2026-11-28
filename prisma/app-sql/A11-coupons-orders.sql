-- A11 (Phase 2 test, batch 1a): coupons work for courses AND books, book orders remember their coupon,
-- and WooCommerce codes stored with "&amp;" become what students type ("&").
-- Additive and re-runnable: IF NOT EXISTS, and the UPDATE only touches codes that still contain "&amp;".

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applies_to varchar(16) NOT NULL DEFAULT 'all';

ALTER TABLE book_orders ADD COLUMN IF NOT EXISTS coupon_id uuid NULL REFERENCES coupons(id);

UPDATE coupons SET code = replace(code, '&amp;', '&'), updated_at = now()
 WHERE code LIKE '%&amp;%'
   AND NOT EXISTS (SELECT 1 FROM coupons c2 WHERE c2.code = replace(coupons.code, '&amp;', '&'));
