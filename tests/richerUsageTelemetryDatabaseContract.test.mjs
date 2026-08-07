import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sqlPath = new URL(
  '../src/features/user-tracking/supabase_richer_usage_diagnostics.sql',
  import.meta.url,
);
const sql = fs.readFileSync(sqlPath, 'utf8');
const compactSql = sql.replace(/\s+/g, ' ');

const metricValues = {
  file_format: ['gmi', 'sosi', 'kof'],
  extension_category: ['gmi', 'sos', 'sosi', 'kof', 'txt', 'other', 'none'],
  file_size_bucket: [
    'lt_100_kib',
    '100_kib_to_lt_1_mib',
    '1_mib_to_lt_10_mib',
    '10_mib_to_lt_50_mib',
    'gte_50_mib',
  ],
  object_count_bucket: [
    '1',
    '2_to_10',
    '11_to_100',
    '101_to_1000',
    '1001_to_10000',
    'gte_10001',
  ],
  coordinate_count_bucket: [
    '0',
    '1_to_10',
    '11_to_100',
    '101_to_1000',
    '1001_to_10000',
    '10001_to_100000',
    'gte_100001',
  ],
  object_mix: ['points_only', 'lines_only', 'points_and_lines'],
  crs_status: ['declared', 'inferred', 'assumed', 'missing', 'invalid', 'unsupported'],
  epsg_category: ['epsg_25832', 'epsg_25833', 'epsg_4326', 'other', 'missing'],
  coordinate_status: [
    'available',
    'no_valid_xy',
    'invalid_or_out_of_range',
    'crs_missing',
    'crs_invalid',
    'crs_unsupported',
  ],
  xy_quality: [
    'all_objects_have_valid_xy',
    'some_objects_missing_valid_xy',
    'no_objects_have_valid_xy',
  ],
  z_quality: [
    'all_coordinates_have_nonzero_z',
    'some_coordinates_missing_or_zero_z',
    'all_coordinates_missing_or_zero_z',
    'not_applicable',
  ],
  parser_warning_bucket: ['0', '1', '2_to_5', 'gte_6'],
  parser_warning_class: [
    'none',
    'coordinate',
    'geometry',
    'field_shape',
    'crs',
    'multiple',
    'other',
  ],
};

const resolutionOutcomes = [
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
  'internal_error',
];

const resultValues = [
  'not_attempted',
  'match',
  'no_match',
  'timeout',
  'network_error',
  'http_4xx',
  'http_5xx',
  'invalid_json',
  'invalid_shape',
  'internal_error',
];

const functionParameters = [
  'p_file_format text',
  'p_extension_category text',
  'p_file_size_bucket text',
  'p_object_count_bucket text',
  'p_coordinate_count_bucket text',
  'p_object_mix text',
  'p_crs_status text',
  'p_epsg_category text',
  'p_coordinate_status text',
  'p_xy_quality text',
  'p_z_quality text',
  'p_parser_warning_bucket text',
  'p_parser_warning_class text',
  'p_app_version text',
  'p_telemetry_schema_version smallint',
  'p_resolution_outcome text',
  'p_primary_result text',
  'p_fallback_result text',
];

const functionParameterPattern = functionParameters.join('\\s*,\\s*');

test('introduces exactly the two additive tables', () => {
  const tableNames = [
    ...sql.matchAll(/CREATE TABLE\s+public\.([a-z_]+)/gi),
  ].map((match) => match[1]);

  assert.deepEqual(tableNames.sort(), [
    'municipality_resolution_daily',
    'upload_metric_daily',
  ]);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS/i);
  assert.doesNotMatch(sql, /CREATE OR REPLACE/i);
});

test('represents the exact invoker RPC signature', () => {
  assert.match(
    sql,
    new RegExp(
      `CREATE FUNCTION public\\.increment_upload_diagnostics\\([\\s\\S]*?` +
        `p_fallback_result text\\s*\\) RETURNS void\\s+` +
        `LANGUAGE plpgsql\\s+SECURITY INVOKER`,
      'i',
    ),
  );
  assert.match(
    compactSql,
    new RegExp(
      `CREATE FUNCTION public\\.increment_upload_diagnostics\\( ${functionParameterPattern} \\) RETURNS void`,
      'i',
    ),
  );
  assert.match(sql, /now\(\) AT TIME ZONE 'UTC'/i);
  assert.match(sql, /RETURNS void\s+LANGUAGE plpgsql\s+SECURITY INVOKER/i);
});

test('does not touch the legacy table or increment RPC', () => {
  assert.doesNotMatch(sql, /public\.aggregates/i);
  assert.doesNotMatch(sql, /increment_aggregate/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+public\.(?:aggregates|increment_aggregate)/i);
});

test('enforces both table contracts and their fixed value domains', () => {
  for (const [metricName, values] of Object.entries(metricValues)) {
    assert.match(sql, new RegExp(`metric_name = '${metricName}'`));
    for (const value of values) {
      assert.match(sql, new RegExp(`'${value}'`));
    }
  }

  for (const value of resolutionOutcomes) {
    assert.match(sql, new RegExp(`'${value}'`));
  }
  for (const value of resultValues) {
    assert.match(sql, new RegExp(`'${value}'`));
  }

  assert.match(sql, /upload_metric_daily_count_nonnegative/);
  assert.match(sql, /municipality_resolution_daily_count_nonnegative/);
  assert.match(sql, /metric_value ~ '\^\[A-Za-z0-9\._-\]\{1,32\}\$'/);
  assert.match(sql, /metric_name = 'telemetry_schema_version'\s+AND metric_value = '1'/);
});

test('uses the required indexes and transactional counter upserts', () => {
  assert.match(
    sql,
    /ON public\.upload_metric_daily \(metric_name, date, metric_value\)/,
  );
  assert.match(
    sql,
    /ON public\.municipality_resolution_daily \(resolution_outcome, date\)/,
  );
  assert.match(
    sql,
    /ON public\.municipality_resolution_daily \(file_format, date\)/,
  );
  assert.equal((sql.match(/ON CONFLICT/g) || []).length, 2);
  assert.match(sql, /count = public\.upload_metric_daily\.count \+ 1/);
  assert.match(sql, /count = public\.municipality_resolution_daily\.count \+ 1/);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
});

test('explicitly enables ordinary RLS without FORCE or policies', () => {
  assert.match(sql, /ALTER TABLE public\.upload_metric_daily ENABLE ROW LEVEL SECURITY;/i);
  assert.match(sql, /ALTER TABLE public\.municipality_resolution_daily ENABLE ROW LEVEL SECURITY;/i);
  assert.doesNotMatch(sql, /FORCE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(sql, /CREATE POLICY/i);
});

test('resets public-client and service-role table ACLs before minimum grants', () => {
  for (const tableName of [
    'upload_metric_daily',
    'municipality_resolution_daily',
  ]) {
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      assert.match(
        compactSql,
        new RegExp(
          `REVOKE ALL PRIVILEGES ON TABLE public\\.${tableName} FROM ${role};`,
          'i',
        ),
      );
    }

    const revokeIndex = compactSql.indexOf(
      `REVOKE ALL PRIVILEGES ON TABLE public.${tableName} FROM service_role;`,
    );
    const grantIndex = compactSql.indexOf(
      `GRANT SELECT, INSERT, UPDATE`,
      revokeIndex,
    );
    assert.ok(revokeIndex >= 0, `${tableName} service reset is missing`);
    assert.ok(grantIndex > revokeIndex, `${tableName} grant precedes reset`);
  }
});

test('restricts the new RPC to service_role and postgres ownership', () => {
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    const privilege = role === 'service_role' ? 'ALL PRIVILEGES' : 'EXECUTE';
    assert.match(
      sql,
      new RegExp(
        `REVOKE ${privilege} ON FUNCTION public\\.increment_upload_diagnostics\\([\\s\\S]*?\\) FROM ${role};`,
        'i',
      ),
    );
  }
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.increment_upload_diagnostics\([\s\S]*?\) TO service_role;/i,
  );
});

test('does not alter managed defaults or introduce prohibited per-upload data', () => {
  assert.doesNotMatch(sql, /ALTER DEFAULT PRIVILEGES/i);
  assert.doesNotMatch(sql, /supabase_admin/i);

  for (const prohibitedColumn of [
    'filename',
    'file_contents',
    'uuid',
    'event_id',
    'ip_address',
    'user_agent',
    'bounding_box',
    'exact_file_size',
    'exact_object_count',
    'exact_coordinate_count',
  ]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`\\b${prohibitedColumn}\\b`, 'i'),
      `prohibited column ${prohibitedColumn} was introduced`,
    );
  }
});
