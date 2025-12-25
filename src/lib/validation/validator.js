import pointRules from '@/data/rules/points.json';
import lineRules from '@/data/rules/lines.json';
import { customPointRules } from '@/data/rules/custom/point-logic';
import { customLineRules } from '@/data/rules/custom/line-logic';

/**
 * Validates a single feature against a set of rules.
 * @param {Object} feature - The feature to validate (point or line).
 * @param {Array} rules - The array of rules to apply.
 * @param {Object} customRules - Custom validation functions.
 * @returns {Array} - Array of error objects.
 */
function validateFeature(feature, rules, customRules) {
  const errors = [];

  rules.forEach((rule) => {
    const value = feature.attributes[rule.fieldKey];

    // 1. Check Required Status
    if (rule.required === 'always') {
      if (value === null || value === undefined || value === '') {
        errors.push({
          featureId: feature.id,
          field: rule.fieldKey,
          message: `Feltet '${rule.fieldKey}' er påkrevd.`,
          type: 'error',
        });
        return; // Skip further checks if missing
      }
    }

    // Skip validation if value is empty and not required
    if (value === null || value === undefined || value === '') {
      return;
    }

    // 2. Check Acceptable Values (if defined)
    if (rule.acceptableValues && rule.acceptableValues.length > 0) {
      const validValues = rule.acceptableValues.map((v) => v.value);
      // Loose comparison for numbers/strings mismatch
      const isValid = validValues.some(
        (v) => String(v) === String(value)
      );

      if (!isValid) {
        errors.push({
          featureId: feature.id,
          field: rule.fieldKey,
          message: `Verdien '${value}' er ikke gyldig. Tillatte verdier: ${validValues.join(
            ', '
          )}`,
          type: 'error',
        });
      }
    }

    // 3. Custom Logic
    if (customRules && customRules[rule.fieldKey]) {
      const customError = customRules[rule.fieldKey](value, feature);
      if (customError) {
        errors.push({
          featureId: feature.id,
          field: rule.fieldKey,
          message: customError,
          type: 'error',
        });
      }
    }
  });

  return errors;
}

/**
 * Main validation function for GMI data.
 * @param {Object} parsedData - The output from GMIParser.
 * @returns {Object} - Validation results containing errors and stats.
 */
export function validateGmiData(parsedData) {
  const results = {
    valid: true,
    errors: [],
    stats: {
      totalPoints: parsedData.points.length,
      totalLines: parsedData.lines.length,
      totalErrors: 0,
    },
  };

  // Validate Points
  parsedData.points.forEach((point) => {
    const pointErrors = validateFeature(
      point,
      pointRules,
      customPointRules
    );
    if (pointErrors.length > 0) {
      results.errors.push(...pointErrors);
    }
  });

  // Validate Lines
  parsedData.lines.forEach((line) => {
    const lineErrors = validateFeature(
      line,
      lineRules,
      customLineRules
    );
    if (lineErrors.length > 0) {
      results.errors.push(...lineErrors);
    }
  });

  results.stats.totalErrors = results.errors.length;
  results.valid = results.errors.length === 0;

  return results;
}
