export const FONT_POLICY = 'system-fallback';
export const BLOCKED_FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

export function deriveFontEvidence(fonts) {
  const requestedFamilies = fonts.requestedFamilies.map((entry) => {
    const faceCount = Number(entry.faceCount);
    const statuses = Array.isArray(entry.statuses) ? entry.statuses : [];
    const available =
      faceCount > 0 && statuses.length === faceCount && statuses.every((status) => status === 'loaded');

    return {
      family: entry.family,
      faceCount,
      statuses,
      cssCheckResult: Boolean(entry.checkResult),
      available,
    };
  });

  return {
    readiness: {
      documentStatus: fonts.status,
      readyWithin10s: Boolean(fonts.readyWithin10s),
    },
    requestedFamilies,
    requestedFamiliesAvailable: requestedFamilies.every((entry) => entry.available),
    effectivePolicy: FONT_POLICY,
    blockedFontHosts: BLOCKED_FONT_HOSTS,
    bodyFamily: fonts.bodyFamily,
    titleFamily: fonts.titleFamily,
  };
}

export function assertSystemFallbackFontEvidence(evidence, caseId = 'unknown') {
  if (evidence.readiness.documentStatus !== 'loaded' || !evidence.readiness.readyWithin10s) {
    throw new Error(`FONT_READINESS_FAILED:${caseId}`);
  }

  const registeredRequestedFaces = evidence.requestedFamilies.filter((entry) => entry.faceCount !== 0);
  if (registeredRequestedFaces.length > 0 || evidence.requestedFamiliesAvailable) {
    throw new Error(`FONT_POLICY_NOT_SYSTEM_FALLBACK:${caseId}`);
  }

  if (evidence.effectivePolicy !== FONT_POLICY) {
    throw new Error(`FONT_POLICY_MISMATCH:${caseId}:${evidence.effectivePolicy}`);
  }
}
