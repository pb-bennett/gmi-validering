ALTER TABLE public.aggregates
  ADD COLUMN IF NOT EXISTS hour smallint NOT NULL DEFAULT 0;

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
  (date, hour, area_type, area_id, event_type);

CREATE OR REPLACE FUNCTION public.increment_aggregate(
  p_date date,
  p_hour smallint,
  p_area_type text,
  p_area_id text,
  p_area_name text,
  p_country text,
  p_region text,
  p_event_type text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.aggregates (
    date,
    hour,
    area_type,
    area_id,
    area_name,
    country,
    region,
    event_type,
    count,
    created_at,
    updated_at
  ) VALUES (
    p_date,
    p_hour,
    p_area_type,
    p_area_id,
    p_area_name,
    p_country,
    p_region,
    p_event_type,
    1,
    now(),
    now()
  )
  ON CONFLICT (date, hour, area_type, area_id, event_type)
  DO UPDATE SET
    count = public.aggregates.count + 1,
    updated_at = now();
END;
$$;
