CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN ('Floral', 'Woody', 'Fresh', 'Amber')),
  notes TEXT NOT NULL DEFAULT '',
  price DOUBLE PRECISION NOT NULL CHECK (price >= 0),
  size TEXT NOT NULL DEFAULT '50 ml',
  tag TEXT,
  glass TEXT NOT NULL DEFAULT '#e8cfd2',
  liquid TEXT NOT NULL DEFAULT '#b97880',
  cap TEXT NOT NULL DEFAULT '#6B1F3A',
  backdrop TEXT NOT NULL DEFAULT '#EDE3D7',
  shape TEXT NOT NULL DEFAULT 'square' CHECK (shape IN ('square', 'round', 'slim')),
  image_url TEXT,
  image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sold_out BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.products, public.admin_users FROM anon, authenticated;
GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT SELECT ON TABLE public.admin_users TO authenticated;

CREATE OR REPLACE FUNCTION public.is_kora_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_kora_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_kora_admin() TO anon, authenticated;

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
  FOR SELECT TO anon, authenticated
  USING (is_active OR (SELECT public.is_kora_admin()));

DROP POLICY IF EXISTS products_admin_insert ON public.products;
CREATE POLICY products_admin_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_kora_admin()));

DROP POLICY IF EXISTS products_admin_update ON public.products;
CREATE POLICY products_admin_update ON public.products
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_kora_admin()))
  WITH CHECK ((SELECT public.is_kora_admin()));

DROP POLICY IF EXISTS products_admin_delete ON public.products;
CREATE POLICY products_admin_delete ON public.products
  FOR DELETE TO authenticated
  USING ((SELECT public.is_kora_admin()));

DROP POLICY IF EXISTS admin_users_read_self ON public.admin_users;
CREATE POLICY admin_users_read_self ON public.admin_users
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_images_admin_insert ON storage.objects;
CREATE POLICY product_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (SELECT public.is_kora_admin()));

DROP POLICY IF EXISTS product_images_admin_update ON storage.objects;
CREATE POLICY product_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT public.is_kora_admin()))
  WITH CHECK (bucket_id = 'product-images' AND (SELECT public.is_kora_admin()));

DROP POLICY IF EXISTS product_images_admin_delete ON storage.objects;
CREATE POLICY product_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT public.is_kora_admin()));
