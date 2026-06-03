import { existsSync, readFileSync, readdirSync } from 'node:fs';

const expectedProductionMatches = [
  'https://chatgpt.com/*',
  'https://gemini.google.com/*',
];
const disallowedTestMatches = ['http://127.0.0.1:*/*', 'http://localhost:*/*'];
const allowedLocaleDirectories = ['en', 'ko'];

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));

function fail(message) {
  console.error(`[promptit] ${message}`);
  process.exitCode = 1;
}

function assertArrayEqual(name, actual, expected) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    fail(`${name} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    fail(`${name} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function collectMatches(entries) {
  return Array.from(
    new Set(
      (entries ?? []).flatMap((entry) =>
        typeof entry === 'object' && entry !== null && Array.isArray(entry.matches)
          ? entry.matches
          : [],
      ),
    ),
  );
}

function readLocaleMessages(locale) {
  const filePath = `dist/_locales/${locale}/messages.json`;

  if (!existsSync(filePath)) {
    fail(`${filePath} must exist.`);
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      fail(`${filePath} must contain a JSON object.`);
      return {};
    }

    return parsed;
  } catch (error) {
    fail(`${filePath} must contain valid JSON. ${error instanceof Error ? error.message : ''}`);
    return {};
  }
}

function getSortedKeys(value) {
  return Object.keys(value).sort();
}

function assertLocaleEntry(locale, messages, key) {
  const entry = messages[key];

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    fail(`dist/_locales/${locale}/messages.json key ${key} must be an object.`);
    return;
  }

  if (typeof entry.message !== 'string' || entry.message.trim().length === 0) {
    fail(`dist/_locales/${locale}/messages.json key ${key}.message must be a non-empty string.`);
  }

  if (typeof entry.description !== 'string' || entry.description.trim().length === 0) {
    fail(`dist/_locales/${locale}/messages.json key ${key}.description must be a non-empty string.`);
  }
}

function assertLocaleDirectories() {
  const localeRootPath = 'dist/_locales';

  if (!existsSync(localeRootPath)) {
    fail(`${localeRootPath} must exist.`);
    return;
  }

  const localeDirectories = readdirSync(localeRootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assertArrayEqual(
    'locale directories',
    localeDirectories,
    allowedLocaleDirectories,
  );
}

function assertLocaleMessages() {
  assertLocaleDirectories();

  const koMessages = readLocaleMessages('ko');
  const enMessages = readLocaleMessages('en');
  const koKeys = getSortedKeys(koMessages);
  const enKeys = getSortedKeys(enMessages);

  assertArrayEqual('locale message keys', enKeys, koKeys);

  for (const locale of ['ko', 'en']) {
    const messages = locale === 'ko' ? koMessages : enMessages;

    for (const key of koKeys) {
      assertLocaleEntry(locale, messages, key);
    }

    if (messages.appName?.message !== 'promptit') {
      fail(`dist/_locales/${locale}/messages.json appName.message must be "promptit".`);
    }

    if (typeof messages.extensionDescription?.message !== 'string' ||
        messages.extensionDescription.message.trim().length === 0) {
      fail(`dist/_locales/${locale}/messages.json extensionDescription.message must be non-empty.`);
    }
  }
}

assertArrayEqual('permissions', manifest.permissions, ['storage']);
assertEqual('default_locale', manifest.default_locale, 'ko');
assertEqual('name', manifest.name, '__MSG_appName__');
assertEqual('description', manifest.description, '__MSG_extensionDescription__');
assertEqual('action.default_title', manifest.action?.default_title, '__MSG_appName__');

if ('host_permissions' in manifest) {
  fail('production manifest must not declare host_permissions.');
}

const contentScriptMatches = (manifest.content_scripts ?? []).flatMap((script) =>
  Array.isArray(script.matches) ? script.matches : [],
);
assertArrayEqual(
  'content_scripts.matches',
  contentScriptMatches,
  expectedProductionMatches,
);

const webAccessibleMatches = collectMatches(manifest.web_accessible_resources);

for (const match of expectedProductionMatches) {
  if (!webAccessibleMatches.includes(match)) {
    fail(`web_accessible_resources.matches is missing ${match}.`);
  }
}

for (const match of disallowedTestMatches) {
  if (
    contentScriptMatches.includes(match) ||
    webAccessibleMatches.includes(match)
  ) {
    fail(`production manifest must not include test match ${match}.`);
  }
}

assertLocaleMessages();
