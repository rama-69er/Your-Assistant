import { DEFAULT_PREFERENCES, sanitizePreferences } from '../core/robotStateMachine';
import type { AssistantPreferences } from '../core/types';

const STORAGE_KEY = 'shimi_local_preferences_v1';

/**
 * Privacy-first local preferences storage.
 * Stores ONLY essential user preferences (name, appearance, toggles).
 * Never stores conversation transcripts, audio recordings, or private photos.
 */
export function loadPreferences(): AssistantPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AssistantPreferences>;
    return sanitizePreferences(parsed);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: AssistantPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function clearAllLocalPreferences(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
