import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeOf } from './ci-scope.mjs';

const ALL_PACKAGES = [
  '@lytronix/dashboard',
  '@lytronix/db',
  '@lytronix/operator',
  '@lytronix/server',
  '@lytronix/storefront',
  '@lytronix/validators',
  '@lytronix/website',
];

function runs(scope) {
  return [
    scope.code && 'code',
    scope.browser && 'browser',
    scope.dashboard && 'dashboard',
    scope.storefront && 'storefront',
    scope.walkthrough && 'walkthrough',
  ].filter(Boolean);
}

for (const [name, changed, reached, expected] of [
  ['the docs', ['docs/PHASE-6-PLAN.md'], [], []],
  ['another drawing', ['docs/brand/lytro-operator.html'], [], []],
  ['a root Markdown file', ['README.md'], [], []],
  ['the listener app, which has its own workflow', ['apps/listener-android/app/a.kt'], [], []],
  [
    'the server',
    ['apps/server/src/a.ts'],
    ['@lytronix/server'],
    ['code', 'browser', 'walkthrough'],
  ],
  [
    'the database package',
    ['packages/db/src/a.ts'],
    ['@lytronix/db', '@lytronix/server'],
    ['code', 'browser', 'walkthrough'],
  ],
  [
    'the dashboard',
    ['apps/dashboard/src/a.tsx'],
    ['@lytronix/dashboard'],
    ['code', 'browser', 'dashboard', 'walkthrough'],
  ],
  [
    'the storefront',
    ['apps/storefront/src/a.tsx'],
    ['@lytronix/storefront'],
    ['code', 'browser', 'storefront'],
  ],
  ['the operator console', ['apps/operator/src/a.tsx'], ['@lytronix/operator'], ['code']],
  ['the website', ['apps/website/src/a.tsx'], ['@lytronix/website'], ['code']],
  ['the media Worker', ['apps/media-worker/src/a.ts'], ['@lytronix/media-worker'], ['code']],
  [
    'the shared screens package',
    ['packages/ui/src/a.tsx'],
    ['@lytronix/dashboard', '@lytronix/operator', '@lytronix/ui'],
    ['code', 'browser', 'dashboard', 'walkthrough'],
  ],
  [
    'the validators, which everything uses',
    ['packages/validators/src/a.ts'],
    ALL_PACKAGES,
    ['code', 'browser', 'dashboard', 'storefront', 'walkthrough'],
  ],
  [
    "the dashboard's prototype, which its browser tests read",
    ['docs/brand/lytro-dashboard.html'],
    [],
    ['code', 'browser', 'dashboard'],
  ],
  [
    "the storefront's prototype, which its browser tests read",
    ['docs/brand/lytro-storefront.html'],
    [],
    ['code', 'browser', 'storefront'],
  ],
]) {
  test(`a change to ${name} runs what it can reach`, () => {
    const scope = scopeOf(changed, reached);
    assert.deepEqual(runs(scope), expected);
    assert.equal(scope.affected, '--affected');
  });
}

for (const path of [
  '.github/workflows/ci.yml',
  '.github/scripts/ci-scope.mjs',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'package.json',
  'turbo.json',
  'eslint.config.mjs',
  '.prettierrc.json',
  'scripts/db/a.sh',
  'deploy/Caddyfile',
  'a-file-nobody-has-thought-of',
]) {
  test(`a change to ${path} runs everything`, () => {
    const scope = scopeOf([path], []);
    assert.deepEqual(runs(scope), ['code', 'browser', 'dashboard', 'storefront', 'walkthrough']);
    assert.equal(scope.affected, '');
    assert.match(scope.why, /outside every package/);
  });
}

test('one file outside every package among many runs everything', () => {
  const scope = scopeOf(['docs/a.md', 'apps/server/src/a.ts', 'turbo.json'], ['@lytronix/server']);
  assert.equal(scope.affected, '');
  assert.equal(scope.dashboard, true);
});

test('nothing to compare runs everything', () => {
  const scope = scopeOf([], []);
  assert.equal(scope.affected, '');
  assert.equal(scope.dashboard, true);
});
