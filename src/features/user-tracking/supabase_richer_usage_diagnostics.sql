BEGIN;

-- This is a one-time additive setup. Plain CREATE statements make an
-- unexpected existing object or signature collision fail visibly.
CREATE TABLE public.upload_metric_daily (
  date date NOT NULL,
  metric_name text NOT NULL,
  metric_value text NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT upload_metric_daily_pkey
    PRIMARY KEY (date, metric_name, metric_value),
  CONSTRAINT upload_metric_daily_count_nonnegative
    CHECK (count >= 0),
  CONSTRAINT upload_metric_daily_metric_value_contract
    CHECK (
      (metric_name = 'file_format' AND metric_value IN ('gmi', 'sosi', 'kof'))
      OR (
        metric_name = 'extension_category'
        AND metric_value IN ('gmi', 'sos', 'sosi', 'kof', 'txt', 'other', 'none')
      )
      OR (
        metric_name = 'file_size_bucket'
        AND metric_value IN (
          'lt_100_kib',
          '100_kib_to_lt_1_mib',
          '1_mib_to_lt_10_mib',
          '10_mib_to_lt_50_mib',
          'gte_50_mib'
        )
      )
      OR (
        metric_name = 'object_count_bucket'
        AND metric_value IN (
          '1',
          '2_to_10',
          '11_to_100',
          '101_to_1000',
          '1001_to_10000',
          'gte_10001'
        )
      )
      OR (
        metric_name = 'coordinate_count_bucket'
        AND metric_value IN (
          '0',
          '1_to_10',
          '11_to_100',
          '101_to_1000',
          '1001_to_10000',
          '10001_to_100000',
          'gte_100001'
        )
      )
      OR (
        metric_name = 'object_mix'
        AND metric_value IN ('points_only', 'lines_only', 'points_and_lines')
      )
      OR (
        metric_name = 'crs_status'
        AND metric_value IN (
          'declared',
          'inferred',
          'assumed',
          'missing',
          'invalid',
          'unsupported'
        )
      )
      OR (
        metric_name = 'epsg_category'
        AND metric_value IN ('epsg_25832', 'epsg_25833', 'epsg_4326', 'other', 'missing')
      )
      OR (
        metric_name = 'coordinate_status'
        AND metric_value IN (
          'available',
          'no_valid_xy',
          'invalid_or_out_of_range',
          'crs_missing',
          'crs_invalid',
          'crs_unsupported'
        )
      )
      OR (
        metric_name = 'xy_quality'
        AND metric_value IN (
          'all_objects_have_valid_xy',
          'some_objects_missing_valid_xy',
          'no_objects_have_valid_xy'
        )
      )
      OR (
        metric_name = 'z_quality'
        AND metric_value IN (
          'all_coordinates_have_nonzero_z',
          'some_coordinates_missing_or_zero_z',
          'all_coordinates_missing_or_zero_z',
          'not_applicable'
        )
      )
      OR (
        metric_name = 'parser_warning_bucket'
        AND metric_value IN ('0', '1', '2_to_5', 'gte_6')
      )
      OR (
        metric_name = 'parser_warning_class'
        AND metric_value IN (
          'none',
          'coordinate',
          'geometry',
          'field_shape',
          'crs',
          'multiple',
          'other'
        )
      )
      OR (
        metric_name = 'app_version'
        AND metric_value ~ '^[A-Za-z0-9._-]{1,32}$'
      )
      OR (
        metric_name = 'telemetry_schema_version'
        AND metric_value = '1'
      )
    )
);

CREATE TABLE public.municipality_resolution_daily (
  date date NOT NULL,
  file_format text NOT NULL,
  resolution_outcome text NOT NULL,
  primary_result text NOT NULL,
  fallback_result text NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT municipality_resolution_daily_pkey
    PRIMARY KEY (
      date,
      file_format,
      resolution_outcome,
      primary_result,
      fallback_result
    ),
  CONSTRAINT municipality_resolution_daily_count_nonnegative
    CHECK (count >= 0),
  CONSTRAINT municipality_resolution_daily_value_contract
    CHECK (
      file_format IN ('gmi', 'sosi', 'kof')
      AND resolution_outcome IN (
        'resolved_primary',
        'resolved_fallback',
        'no_coordinate',
        'crs_missing',
        'crs_invalid',
        'crs_unsupported',
        'coordinate_invalid',
        'outside_norway',
        'no_match',
        'timeout',
        'network_failure',
        'upstream_http_failure',
        'invalid_upstream_response',
        'internal_error'
      )
      AND primary_result IN (
        'not_attempted',
        'match',
        'no_match',
        'timeout',
        'network_error',
        'http_4xx',
        'http_5xx',
        'invalid_json',
        'invalid_shape',
        'internal_error'
      )
      AND fallback_result IN (
        'not_attempted',
        'match',
        'no_match',
        'timeout',
        'network_error',
        'http_4xx',
        'http_5xx',
        'invalid_json',
        'invalid_shape',
        'internal_error'
      )
    )
);

ALTER TABLE public.upload_metric_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipality_resolution_daily ENABLE ROW LEVEL SECURITY;

CREATE INDEX upload_metric_daily_metric_date_value_idx
  ON public.upload_metric_daily (metric_name, date, metric_value);

CREATE INDEX municipality_resolution_daily_outcome_date_idx
  ON public.municipality_resolution_daily (resolution_outcome, date);

CREATE INDEX municipality_resolution_daily_format_date_idx
  ON public.municipality_resolution_daily (file_format, date);

CREATE FUNCTION public.increment_upload_diagnostics(
  p_file_format text,
  p_extension_category text,
  p_file_size_bucket text,
  p_object_count_bucket text,
  p_coordinate_count_bucket text,
  p_object_mix text,
  p_crs_status text,
  p_epsg_category text,
  p_coordinate_status text,
  p_xy_quality text,
  p_z_quality text,
  p_parser_warning_bucket text,
  p_parser_warning_class text,
  p_app_version text,
  p_telemetry_schema_version smallint,
  p_resolution_outcome text,
  p_primary_result text,
  p_fallback_result text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_date date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_file_format IS NULL
    OR p_file_format NOT IN ('gmi', 'sosi', 'kof')
    OR p_extension_category IS NULL
    OR p_extension_category NOT IN ('gmi', 'sos', 'sosi', 'kof', 'txt', 'other', 'none')
    OR p_file_size_bucket IS NULL
    OR p_file_size_bucket NOT IN (
      'lt_100_kib',
      '100_kib_to_lt_1_mib',
      '1_mib_to_lt_10_mib',
      '10_mib_to_lt_50_mib',
      'gte_50_mib'
    )
    OR p_object_count_bucket IS NULL
    OR p_object_count_bucket NOT IN (
      '1',
      '2_to_10',
      '11_to_100',
      '101_to_1000',
      '1001_to_10000',
      'gte_10001'
    )
    OR p_coordinate_count_bucket IS NULL
    OR p_coordinate_count_bucket NOT IN (
      '0',
      '1_to_10',
      '11_to_100',
      '101_to_1000',
      '1001_to_10000',
      '10001_to_100000',
      'gte_100001'
    )
    OR p_object_mix IS NULL
    OR p_object_mix NOT IN ('points_only', 'lines_only', 'points_and_lines')
    OR p_crs_status IS NULL
    OR p_crs_status NOT IN ('declared', 'inferred', 'assumed', 'missing', 'invalid', 'unsupported')
    OR p_epsg_category IS NULL
    OR p_epsg_category NOT IN ('epsg_25832', 'epsg_25833', 'epsg_4326', 'other', 'missing')
    OR p_coordinate_status IS NULL
    OR p_coordinate_status NOT IN (
      'available',
      'no_valid_xy',
      'invalid_or_out_of_range',
      'crs_missing',
      'crs_invalid',
      'crs_unsupported'
    )
    OR p_xy_quality IS NULL
    OR p_xy_quality NOT IN (
      'all_objects_have_valid_xy',
      'some_objects_missing_valid_xy',
      'no_objects_have_valid_xy'
    )
    OR p_z_quality IS NULL
    OR p_z_quality NOT IN (
      'all_coordinates_have_nonzero_z',
      'some_coordinates_missing_or_zero_z',
      'all_coordinates_missing_or_zero_z',
      'not_applicable'
    )
    OR p_parser_warning_bucket IS NULL
    OR p_parser_warning_bucket NOT IN ('0', '1', '2_to_5', 'gte_6')
    OR p_parser_warning_class IS NULL
    OR p_parser_warning_class NOT IN (
      'none',
      'coordinate',
      'geometry',
      'field_shape',
      'crs',
      'multiple',
      'other'
    )
    OR p_app_version IS NULL
    OR p_app_version !~ '^[A-Za-z0-9._-]{1,32}$'
    OR p_telemetry_schema_version IS DISTINCT FROM 1
    OR p_resolution_outcome IS NULL
    OR p_resolution_outcome NOT IN (
      'resolved_primary',
      'resolved_fallback',
      'no_coordinate',
      'crs_missing',
      'crs_invalid',
      'crs_unsupported',
      'coordinate_invalid',
      'outside_norway',
      'no_match',
      'timeout',
      'network_failure',
      'upstream_http_failure',
      'invalid_upstream_response',
      'internal_error'
    )
    OR p_primary_result IS NULL
    OR p_primary_result NOT IN (
      'not_attempted',
      'match',
      'no_match',
      'timeout',
      'network_error',
      'http_4xx',
      'http_5xx',
      'invalid_json',
      'invalid_shape',
      'internal_error'
    )
    OR p_fallback_result IS NULL
    OR p_fallback_result NOT IN (
      'not_attempted',
      'match',
      'no_match',
      'timeout',
      'network_error',
      'http_4xx',
      'http_5xx',
      'invalid_json',
      'invalid_shape',
      'internal_error'
    )
  THEN
    RAISE EXCEPTION 'invalid upload diagnostics contract'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.upload_metric_daily (
    date,
    metric_name,
    metric_value,
    count
  ) VALUES
    (v_date, 'file_format', p_file_format, 1),
    (v_date, 'extension_category', p_extension_category, 1),
    (v_date, 'file_size_bucket', p_file_size_bucket, 1),
    (v_date, 'object_count_bucket', p_object_count_bucket, 1),
    (v_date, 'coordinate_count_bucket', p_coordinate_count_bucket, 1),
    (v_date, 'object_mix', p_object_mix, 1),
    (v_date, 'crs_status', p_crs_status, 1),
    (v_date, 'epsg_category', p_epsg_category, 1),
    (v_date, 'coordinate_status', p_coordinate_status, 1),
    (v_date, 'xy_quality', p_xy_quality, 1),
    (v_date, 'z_quality', p_z_quality, 1),
    (v_date, 'parser_warning_bucket', p_parser_warning_bucket, 1),
    (v_date, 'parser_warning_class', p_parser_warning_class, 1),
    (v_date, 'app_version', p_app_version, 1),
    (
      v_date,
      'telemetry_schema_version',
      p_telemetry_schema_version::text,
      1
    )
  ON CONFLICT (date, metric_name, metric_value)
  DO UPDATE SET
    count = public.upload_metric_daily.count + 1,
    updated_at = now();

  INSERT INTO public.municipality_resolution_daily (
    date,
    file_format,
    resolution_outcome,
    primary_result,
    fallback_result,
    count
  ) VALUES (
    v_date,
    p_file_format,
    p_resolution_outcome,
    p_primary_result,
    p_fallback_result,
    1
  )
  ON CONFLICT (
    date,
    file_format,
    resolution_outcome,
    primary_result,
    fallback_result
  )
  DO UPDATE SET
    count = public.municipality_resolution_daily.count + 1,
    updated_at = now();
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE public.upload_metric_daily FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.upload_metric_daily FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.upload_metric_daily FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.upload_metric_daily FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.upload_metric_daily TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.municipality_resolution_daily FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.municipality_resolution_daily FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.municipality_resolution_daily FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.municipality_resolution_daily FROM service_role;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.municipality_resolution_daily
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_upload_diagnostics(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  text,
  text,
  text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_upload_diagnostics(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  text,
  text,
  text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_upload_diagnostics(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  text,
  text,
  text
) FROM authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.increment_upload_diagnostics(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  text,
  text,
  text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.increment_upload_diagnostics(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  text,
  text,
  text
) TO service_role;

COMMIT;
