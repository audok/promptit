import { readFileSync } from 'node:fs';

const expectedProductionMatches = [
  'https://chatgpt.com/*',
  'https://gemini.google.com/*',
];
const disallowedTestMatches = ['http://127.0.0.1:*/*', 'http://localhost:*/*'];

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

assertArrayEqual('permissions', manifest.permissions, ['storage']);

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
