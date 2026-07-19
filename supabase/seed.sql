-- ============================================================
-- SEED DATA
-- Replace IDs with real Supabase auth user IDs after setup
-- ============================================================

-- Sample Products
INSERT INTO public.products (title, sku, description, grade, items_per_lot, retail_price_per_lot, wholesale_price_per_lot, minimum_wholesale_lots, available_stock_lots, tags) VALUES
('Dell OptiPlex 7080 SFF i7-10700', 'DELL-7080-SFF', 'Refurbished Dell OptiPlex 7080 Small Form Factor, Intel i7-10700, 16GB RAM, 512GB SSD', 'Grade_A', 1, 299.99, 249.99, 5, 50, ARRAY['desktop', 'dell', 'i7']),
('Dell OptiPlex 7080 SFF i5-10500', 'DELL-7080-SFF-I5', 'Refurbished Dell OptiPlex 7080 SFF, Intel i5-10500, 8GB RAM, 256GB SSD', 'Grade_B', 1, 199.99, 159.99, 5, 75, ARRAY['desktop', 'dell', 'i5']),
('HP ProDesk 400 G7 SFF', 'HP-400-G7', 'HP ProDesk 400 G7 SFF, Intel i5-10500, 8GB RAM, 256GB SSD. Minor cosmetic wear.', 'Grade_C', 1, 149.99, 119.99, 10, 30, ARRAY['desktop', 'hp', 'i5']),
('Server RAM Lot - DDR4 16GB', 'RAM-DDR4-16GB', 'Lot of 10x DDR4 16GB 3200MHz Server RAM sticks. Tested working, no DOA.', 'Grade_A', 10, 89.99, 69.99, 2, 100, ARRAY['ram', 'server', 'ddr4']),
('CPU Lot - Xeon Silver 4210', 'CPU-XEON-4210', 'Lot of 5x Intel Xeon Silver 4210 2.2GHz 10-Core. Pulls from decommissioned servers.', 'Grade_B', 5, 149.99, 119.99, 3, 20, ARRAY['cpu', 'xeon', 'server']),
('SSD Lot - 500GB SATA III', 'SSD-500GB-SATA', 'Lot of 20x 500GB SATA III SSDs. Mixed brands. Sold AS-IS, untested.', 'For_Parts', 20, 49.99, 39.99, 5, 15, ARRAY['ssd', 'storage', 'as-is']);

-- Note: Profiles are created automatically via the trigger on auth.users signup.
-- Create an admin profile manually after creating the admin auth user:
-- INSERT INTO public.profiles (id, full_name, role) VALUES ('<admin-auth-uuid>', 'Admin User', 'admin');
