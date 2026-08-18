export const WARNING_CLASSES = Object.freeze([
  'coordinate',
  'geometry',
  'field_shape',
  'crs',
  'other',
]);

const createClassCounts = () =>
  WARNING_CLASSES.reduce((counts, warningClass) => {
    counts[warningClass] = 0;
    return counts;
  }, {});

export const createWarningSummary = () => ({
  total: 0,
  classes: createClassCounts(),
});

// This is the only parser warning emission path: display text stays local while
// the fixed class is recorded in a separate, minimal in-memory summary.
export const recordWarning = (
  warnings,
  summary,
  fixedClass,
  displayMessage,
) => {
  const warningClass = WARNING_CLASSES.includes(fixedClass)
    ? fixedClass
    : 'other';
  warnings.push(displayMessage);
  summary.total += 1;
  summary.classes[warningClass] += 1;
};

export const classifyParserWarnings = (summary) => {
  const total = summary?.total;
  if (!Number.isInteger(total) || total < 0) return null;

  const classCounts = summary?.classes;
  if (!classCounts || typeof classCounts !== 'object') return null;
  const expectedClasses = [...WARNING_CLASSES].sort();
  const actualClasses = Object.keys(classCounts).sort();
  if (
    actualClasses.length !== expectedClasses.length ||
    actualClasses.some((warningClass, index) =>
      warningClass !== expectedClasses[index],
    )
  ) {
    return null;
  }

  let classCountTotal = 0;
  for (const warningClass of WARNING_CLASSES) {
    const count = classCounts[warningClass];
    if (!Number.isInteger(count) || count < 0) return null;
    classCountTotal += count;
  }
  if (classCountTotal !== total) return null;

  const warningClasses = WARNING_CLASSES.filter(
    (warningClass) =>
      classCounts[warningClass] > 0,
  );

  let parserWarningClass = 'none';
  if (total > 0) {
    parserWarningClass =
      warningClasses.length === 1 ? warningClasses[0] : 'multiple';
    if (warningClasses.length === 0) parserWarningClass = 'other';
  }

  return {
    parserWarningBucket:
      total === 0 ? '0' : total === 1 ? '1' : total <= 5 ? '2_to_5' : 'gte_6',
    parserWarningClass,
  };
};
