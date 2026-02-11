ALTER TABLE public.aggregates
  ADD COLUMN IF NOT EXISTS hour smallint NOT NULL DEFAULT 0;

ALTER TABLE public.aggregates
  ADD COLUMN IF NOT EXISTS dataset_area_type text,
  ADD COLUMN IF NOT EXISTS dataset_area_id text,
  ADD COLUMN IF NOT EXISTS dataset_area_name text,
  ADD COLUMN IF NOT EXISTS dataset_country text,
  ADD COLUMN IF NOT EXISTS dataset_region text,
  ADD COLUMN IF NOT EXISTS uploader_area_type text,
  ADD COLUMN IF NOT EXISTS uploader_area_id text,
  ADD COLUMN IF NOT EXISTS uploader_area_name text,
  ADD COLUMN IF NOT EXISTS uploader_country text,
  ADD COLUMN IF NOT EXISTS uploader_region text;

-- Backfill dataset fields from legacy columns (if present)
UPDATE public.aggregates
SET
  dataset_area_type = COALESCE(dataset_area_type, area_type),
  dataset_area_id = COALESCE(dataset_area_id, area_id),
  dataset_area_name = COALESCE(dataset_area_name, area_name),
  dataset_country = COALESCE(dataset_country, country),
  dataset_region = COALESCE(dataset_region, region)
WHERE dataset_area_type IS NULL OR dataset_area_id IS NULL;

-- Ensure uploader fields have a default if unknown
UPDATE public.aggregates
SET
  uploader_area_type = COALESCE(uploader_area_type, 'unknown'),
  uploader_area_id = COALESCE(uploader_area_id, 'unknown'),
  uploader_area_name = COALESCE(uploader_area_name, 'Unknown')
WHERE uploader_area_type IS NULL OR uploader_area_id IS NULL;

ALTER TABLE public.aggregates
  ALTER COLUMN dataset_area_type SET DEFAULT 'unknown',
  ALTER COLUMN dataset_area_id SET DEFAULT 'unknown',
  ALTER COLUMN uploader_area_type SET DEFAULT 'unknown',
  ALTER COLUMN uploader_area_id SET DEFAULT 'unknown';

ALTER TABLE public.aggregates
  ALTER COLUMN dataset_area_type SET NOT NULL,
  ALTER COLUMN dataset_area_id SET NOT NULL,
  ALTER COLUMN uploader_area_type SET NOT NULL,
  ALTER COLUMN uploader_area_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'aggregates'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE public.aggregates DROP CONSTRAINT IF EXISTS aggregates_pkey;
  END IF;
END $$;

ALTER TABLE public.aggregates
  ADD CONSTRAINT aggregates_pkey PRIMARY KEY
  (
    date,
    hour,
    dataset_area_type,
    dataset_area_id,
    uploader_area_type,
    uploader_area_id,
    event_type
  );

CREATE OR REPLACE FUNCTION public.increment_aggregate(
  p_date date,
  p_hour smallint,
  p_dataset_area_type text,
  p_dataset_area_id text,
  p_dataset_area_name text,
  p_dataset_country text,
  p_dataset_region text,
  p_uploader_area_type text,
  p_uploader_area_id text,
  p_uploader_area_name text,
  p_uploader_country text,
  p_uploader_region text,
  p_event_type text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.aggregates (
    date,
    hour,
    dataset_area_type,
    dataset_area_id,
    dataset_area_name,
    dataset_country,
    dataset_region,
    uploader_area_type,
    uploader_area_id,
    uploader_area_name,
    uploader_country,
    uploader_region,
    event_type,
    count,
    created_at,
    updated_at
  ) VALUES (
    p_date,
    p_hour,
    p_dataset_area_type,
    p_dataset_area_id,
    p_dataset_area_name,
    p_dataset_country,
    p_dataset_region,
    p_uploader_area_type,
    p_uploader_area_id,
    p_uploader_area_name,
    p_uploader_country,
    p_uploader_region,
    p_event_type,
    1,
    now(),
    now()
  )
  ON CONFLICT (
    date,
    hour,
    dataset_area_type,
    dataset_area_id,
    uploader_area_type,
    uploader_area_id,
    event_type
  )
  DO UPDATE SET
    count = public.aggregates.count + 1,
    updated_at = now();
END;
$$;
