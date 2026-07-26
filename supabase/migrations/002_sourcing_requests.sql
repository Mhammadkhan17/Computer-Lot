CREATE TABLE public.sourcing_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT,
    phone TEXT,
    listing_url TEXT NOT NULL,
    title TEXT NOT NULL,
    current_bid NUMERIC(10,2),
    msrp NUMERIC(10,2),
    pallet_count INT,
    unit_count INT,
    source_retailer TEXT,
    condition TEXT,
    location TEXT,
    quantity_requested INT NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sourcing_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sourcing requests"
    ON public.sourcing_requests FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Admins can view all sourcing requests"
    ON public.sourcing_requests FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Users can create own sourcing requests"
    ON public.sourcing_requests FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update sourcing requests"
    ON public.sourcing_requests FOR UPDATE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));
