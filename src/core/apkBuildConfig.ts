import type {
  ApkBuildRequest,
  PersonalityStyle,
  RobotAccessory,
  RobotStyle,
} from './types';
import { ROBOT_COLOR_THEMES } from './robotStateMachine';

export const ALLOWED_ROBOT_STYLES: readonly RobotStyle[] = ['pod', 'aero', 'deskbot'] as const;
export const ALLOWED_ACCESSORIES: readonly RobotAccessory[] = [
  'none',
  'halo',
  'beanie',
  'glasses',
  'headphones',
  'star',
] as const;
export const ALLOWED_PERSONALITIES: readonly PersonalityStyle[] = ['warm', 'playful', 'calm'] as const;
export const ALLOWED_THEME_IDS: readonly string[] = ROBOT_COLOR_THEMES.map((t) => t.id);

const SEMVER_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const SAFE_LABEL_REGEX = /^[A-Za-z0-9][A-Za-z0-9 '-]{0,27}$/;
const GITHUB_REPO_REGEX = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITHUB_REF_REGEX = /^[A-Za-z0-9_./-]{1,120}$/;

export interface ValidatedApkBuildConfig {
  valid: boolean;
  errors: string[];
  normalized?: ApkBuildRequest;
}

export function sanitizeSlug(input: string, fallback = 'shimi'): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return cleaned || fallback;
}

export function isValidGithubRepo(repo: string | undefined | null): repo is string {
  if (!repo || typeof repo !== 'string') return false;
  const trimmed = repo.trim();
  return GITHUB_REPO_REGEX.test(trimmed) && !trimmed.includes('..');
}

export function isValidGithubRef(ref: string | undefined | null): ref is string {
  if (!ref || typeof ref !== 'string') return false;
  const trimmed = ref.trim();
  return GITHUB_REF_REGEX.test(trimmed) && !trimmed.includes('..');
}

export function suggestNextVersion(latestVersion?: string | null): string {
  if (!latestVersion) return '2.1.0';
  const stripped = latestVersion.trim().replace(/^v/i, '');
  const match = stripped.match(SEMVER_REGEX);
  if (!match) return '2.1.0';
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return `${major}.${minor}.${patch + 1}`;
}

export function computeVersionCode(versionName: string, runNumber = 0): number {
  const stripped = versionName.trim().replace(/^v/i, '');
  const match = stripped.match(SEMVER_REGEX);
  if (!match) return Math.max(100, 100 + Math.max(0, Math.floor(runNumber)));
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const semverBase = major * 10000 + minor * 100 + patch;
  return semverBase + Math.max(0, Math.floor(runNumber));
}

export function formatApkFileName(
  assistantName: string,
  versionName: string,
  signed: boolean
): string {
  const slug = sanitizeSlug(assistantName, 'shimi');
  const cleanVersion = versionName.trim().replace(/^v/i, '');
  const versionPart = SEMVER_REGEX.test(cleanVersion) ? cleanVersion : '2.1.0';
  return signed
    ? `shimi-${slug}-v${versionPart}.apk`
    : `shimi-${slug}-v${versionPart}-unsigned-debug.apk`;
}

export function validateApkBuildRequest(raw: Partial<ApkBuildRequest>): ValidatedApkBuildConfig {
  const errors: string[] = [];

  const assistantName = typeof raw.assistantName === 'string' ? raw.assistantName.trim() : '';
  if (!assistantName || assistantName.length < 2 || assistantName.length > 28) {
    errors.push('Assistant name must be between 2 and 28 characters.');
  } else if (!SAFE_LABEL_REGEX.test(assistantName)) {
    errors.push('Assistant name can only contain letters, numbers, spaces, hyphens, or apostrophes.');
  }

  const wakeWord = typeof raw.wakeWord === 'string' ? raw.wakeWord.trim() : assistantName;
  if (!wakeWord || wakeWord.length < 2 || wakeWord.length > 28) {
    errors.push('Wake word must be between 2 and 28 characters.');
  } else if (!SAFE_LABEL_REGEX.test(wakeWord)) {
    errors.push('Wake word can only contain letters, numbers, spaces, hyphens, or apostrophes.');
  }

  const robotStyle = raw.robotStyle as RobotStyle;
  if (!ALLOWED_ROBOT_STYLES.includes(robotStyle)) {
    errors.push('Invalid robot style selection.');
  }

  const accessory = raw.accessory as RobotAccessory;
  if (!ALLOWED_ACCESSORIES.includes(accessory)) {
    errors.push('Invalid accessory selection.');
  }

  const personality = raw.personality as PersonalityStyle;
  if (!ALLOWED_PERSONALITIES.includes(personality)) {
    errors.push('Invalid personality selection.');
  }

  const themeId = typeof raw.themeId === 'string' ? raw.themeId.trim() : '';
  if (!ALLOWED_THEME_IDS.includes(themeId)) {
    errors.push('Invalid theme selection.');
  }

  const rawVersion = typeof raw.versionName === 'string' ? raw.versionName.trim().replace(/^v/i, '') : '2.1.0';
  if (!SEMVER_REGEX.test(rawVersion)) {
    errors.push('Version must follow semantic versioning (for example: 2.1.0).');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      assistantName,
      wakeWord,
      robotStyle,
      accessory,
      personality,
      themeId,
      versionName: rawVersion,
    },
  };
}

export function buildGradlePropertyFlags(config: ApkBuildRequest, versionCode?: number): string[] {
  const code = versionCode ?? computeVersionCode(config.versionName, 1);
  return [
    `-PSHIMI_DEFAULT_NAME=${config.assistantName}`,
    `-PSHIMI_DEFAULT_WAKE_WORD=${config.wakeWord}`,
    `-PSHIMI_DEFAULT_STYLE=${config.robotStyle}`,
    `-PSHIMI_DEFAULT_ACCESSORY=${config.accessory}`,
    `-PSHIMI_DEFAULT_PERSONALITY=${config.personality}`,
    `-PSHIMI_DEFAULT_THEME=${config.themeId}`,
    `-PSHIMI_VERSION_NAME=${config.versionName}`,
    `-PSHIMI_VERSION_CODE=${code}`,
  ];
}
