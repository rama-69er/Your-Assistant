import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGradlePropertyFlags,
  computeVersionCode,
  formatApkFileName,
  isValidGithubRef,
  isValidGithubRepo,
  sanitizeSlug,
  suggestNextVersion,
  validateApkBuildRequest,
} from './apkBuildConfig';

test('formatApkFileName produces deterministic space-free signed and unsigned filenames', () => {
  assert.equal(formatApkFileName('Milo', '2.1.0', true), 'shimi-milo-v2.1.0.apk');
  assert.equal(
    formatApkFileName('Milo', '2.1.0', false),
    'shimi-milo-v2.1.0-unsigned-debug.apk'
  );
  assert.equal(
    formatApkFileName('Captain Milo!', 'v2.4.3', true),
    'shimi-captain-milo-v2.4.3.apk'
  );
  assert.equal(/\s/.test(formatApkFileName('My Cute Bot', '2.1.0', true)), false);
});

test('validateApkBuildRequest accepts valid personalized config and rejects invalid inputs', () => {
  const valid = validateApkBuildRequest({
    assistantName: 'Milo',
    wakeWord: 'Milo',
    robotStyle: 'aero',
    accessory: 'headphones',
    personality: 'playful',
    themeId: 'sage-emerald',
    versionName: '2.1.0',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized?.assistantName, 'Milo');
  assert.equal(valid.normalized?.versionName, '2.1.0');

  const invalid = validateApkBuildRequest({
    assistantName: 'M',
    wakeWord: 'bad$word;',
    robotStyle: 'invalid' as never,
    accessory: 'none',
    personality: 'warm',
    themeId: 'unknown-theme',
    versionName: 'not-semver',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length >= 4);
});

test('buildGradlePropertyFlags and computeVersionCode generate valid Gradle overrides', () => {
  const code1 = computeVersionCode('2.1.0', 1);
  const code2 = computeVersionCode('2.1.0', 2);
  assert.ok(code2 > code1);
  assert.equal(suggestNextVersion('2.1.0'), '2.1.1');
  assert.equal(suggestNextVersion(null), '2.1.0');

  const flags = buildGradlePropertyFlags(
    {
      assistantName: 'Milo',
      wakeWord: 'Milo',
      robotStyle: 'aero',
      accessory: 'headphones',
      personality: 'playful',
      themeId: 'sage-emerald',
      versionName: '2.1.0',
    },
    code1
  );
  assert.ok(flags.includes('-PSHIMI_DEFAULT_NAME=Milo'));
  assert.ok(flags.includes('-PSHIMI_DEFAULT_WAKE_WORD=Milo'));
  assert.ok(flags.includes('-PSHIMI_DEFAULT_STYLE=aero'));
  assert.ok(flags.includes('-PSHIMI_DEFAULT_ACCESSORY=headphones'));
  assert.ok(flags.includes(`-PSHIMI_VERSION_CODE=${code1}`));
});

test('isValidGithubRepo and isValidGithubRef block SSRF / path traversal patterns', () => {
  assert.equal(isValidGithubRepo('acme/shimi-android'), true);
  assert.equal(isValidGithubRepo('https://evil.com/foo/bar'), false);
  assert.equal(isValidGithubRepo('acme/../secret'), false);
  assert.equal(isValidGithubRef('main'), true);
  assert.equal(isValidGithubRef('release/v2.1'), true);
  assert.equal(isValidGithubRef('../../etc/passwd'), false);
  assert.equal(sanitizeSlug('   !!!   '), 'shimi');
});
