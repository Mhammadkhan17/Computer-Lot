-- ============================================================
-- PRODUCT IMAGE STORAGE
-- ============================================================
-- Bucket for product photos uploaded from the admin dashboard.
-- Public bucket: uploaded images get stable public URLs that are stored in
-- products.images (TEXT[]) alongside any externally pasted image URLs.
-- Defensive limits mirror the client-side guards in product-form.tsx.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS mirrors the product-table pattern: admin writes. There is no
-- SELECT policy: public buckets already serve files by URL without RLS, and a
-- broad SELECT policy would allow anonymous bucket listing (advisor lint
-- `public_bucket_allows_listing`). is_admin() is used (initplan-wrapped) to
-- avoid self-referential recursion.
-- RLS is already enabled on storage.objects by default (requires the storage
-- table owner to alter, so not repeated here).

CREATE POLICY "Admin can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (select public.is_admin()));

CREATE POLICY "Admin can update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images' AND (select public.is_admin()));

CREATE POLICY "Admin can delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images' AND (select public.is_admin()));
