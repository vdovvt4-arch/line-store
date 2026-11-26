INSERT INTO public.coupons (code, type, value, min_order, active)
VALUES ('LINE10', 'percent', 10, 0, true)
ON CONFLICT (code) DO NOTHING;
