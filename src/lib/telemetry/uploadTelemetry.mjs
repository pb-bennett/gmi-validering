import {
  buildUploadTelemetry,
  classifyCoordinateCount,
  classifyCoordinateStatus,
  classifyExtension,
  classifyFileFormat,
  classifyFileSize,
  classifyObjectCount,
  classifyObjectMix,
  classifyParserWarnings,
  classifyXyQuality,
  classifyZQuality,
  isUsableDatasetCoordinate,
} from './classifiers.mjs';

const countCoordinates = (data) => {
  let count = 0;
  for (const features of [data?.points, data?.lines]) {
    if (!Array.isArray(features)) continue;
    for (const feature of features) {
      if (Array.isArray(feature?.coordinates)) {
        count += feature.coordinates.length;
      }
    }
  }
  return count;
};

export const deriveUploadTelemetry = ({
  parsedData,
  fileName,
  fileSize,
  crs,
  datasetCoord,
  warningSummary,
} = {}) => {
  try {
    if (parsedData?.errors?.length > 0) return null;
    const warningMetadata = classifyParserWarnings(warningSummary);
    if (!warningMetadata) return null;

    const points = Array.isArray(parsedData?.points)
      ? parsedData.points
      : [];
    const lines = Array.isArray(parsedData?.lines) ? parsedData.lines : [];
    const xyQuality = classifyXyQuality({ points, lines });

    return buildUploadTelemetry({
      fileFormat: classifyFileFormat(parsedData?.format),
      extensionCategory: classifyExtension(fileName),
      fileSizeBucket: classifyFileSize(fileSize),
      objectCountBucket: classifyObjectCount(points.length + lines.length),
      coordinateCountBucket: classifyCoordinateCount(
        countCoordinates({ points, lines }),
      ),
      objectMix: classifyObjectMix(points, lines),
      crsStatus: crs?.crsStatus,
      epsgCategory: crs?.epsgCategory,
      coordinateStatus: classifyCoordinateStatus({
        crsStatus: crs?.crsStatus,
        xyQuality,
        operationalCoordinateAvailable:
          isUsableDatasetCoordinate(datasetCoord),
      }),
      xyQuality,
      zQuality: classifyZQuality({ points, lines }),
      parserWarningBucket: warningMetadata.parserWarningBucket,
      parserWarningClass: warningMetadata.parserWarningClass,
    });
  } catch {
    return null;
  }
};

export const buildLegacyTrackRequestBody = (datasetCoord) => ({
  eventType: 'upload_success',
  datasetCoord,
});

export const completeSuccessfulUpload = ({
  deriveTelemetry = deriveUploadTelemetry,
  telemetryInput,
  datasetCoord,
  trackUploadSuccess,
  onComplete,
} = {}) => {
  let boundedTelemetry = null;
  try {
    boundedTelemetry = deriveTelemetry(telemetryInput) || null;
  } catch {
    boundedTelemetry = null;
  }

  void boundedTelemetry;
  trackUploadSuccess(datasetCoord);
  if (onComplete) onComplete();
  return boundedTelemetry;
};
