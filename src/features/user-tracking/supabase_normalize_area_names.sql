-- Normalise existing area_name and area_id values
-- 1) Create a URL-decode helper that turns percent-encoded strings into UTF-8 text

CREATE OR REPLACE FUNCTION public.url_decode(input text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  out bytea := '';
  pos int := 1;
  len int := length(input);
  c text;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;
  WHILE pos <= len LOOP
    c := substr(input,pos,1);
    IF c = '%' AND pos+2 <= len THEN
      out := out || decode(substr(input,pos+1,2), 'hex');
      pos := pos + 3;
    ELSE
      out := out || convert_to(c,'UTF8');
      pos := pos + 1;
    END IF;
  END LOOP;
  RETURN convert_from(out,'UTF8');
END;
$$;

-- 2) Ensure 'unaccent' extension exists so we can create reasonable slugs
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 3) Create slugify function (simple, uses unaccent)
CREATE OR REPLACE FUNCTION public.slugify_text(in_text text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(regexp_replace(unaccent(public.url_decode(coalesce(in_text,''))), '\s+', '-', 'g'), '[^a-z0-9\-]+', '', 'g'));
$$;

-- 4) Update rows where area_name looks percent-encoded
UPDATE public.aggregates
SET area_name = public.url_decode(area_name)
WHERE area_name LIKE '%\%%';

-- 5) Recompute area_id from decoded area_name where it looks wrong/empty
UPDATE public.aggregates
SET area_id = public.slugify_text(area_name)
WHERE area_type = 'kommune' AND (area_id IS NULL OR area_id = '' OR area_id !~ '^[a-z0-9\-]+$');

-- 6) Optional: verify results
-- SELECT date, area_type, area_id, area_name FROM public.aggregates WHERE area_name LIKE '%�%' OR area_name LIKE '%C3%';
