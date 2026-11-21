import {
  extractDurationSeconds,
  routeCommandLocally,
  stripWakePhrase,
} from './intentRouter';
import type {
  PersonalityStyle,
  PermissionStatusMap,
  ShimiInterpretation,
} from './types';

export { stripWakePhrase };

export function extractSeconds(text: string): number | undefined {
  return extractDurationSeconds(text);
}

/**
 * Backward-compatible wrapper around the offline-first IntentRouter.
 */
export function interpretCommandLocally(
  rawUtterance: string,
  assistantName: string,
  personality: PersonalityStyle,
  permissions: PermissionStatusMap,
  isOnline = false
): ShimiInterpretation {
  return routeCommandLocally({
    rawUtterance,
    assistantName,
    personality,
    permissions,
    isOnline,
  }).interpretation;
}
