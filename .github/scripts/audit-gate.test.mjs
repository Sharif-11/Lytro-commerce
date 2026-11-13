import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verdictOf } from './audit-gate.mjs';

// D9-4 (Slice 9.7): which advisories the dependency audit's gate fails on.
const advisory = (id, severity, module_name = 'pkg') => ({
  github_advisory_id: id,
  severity,
  module_name,
  title: `${id} title`,
});
const auditOf = (...advisories) => ({
  advisories: Object.fromEntries(advisories.map((each, index) => [String(index), each])),
  metadata: { vulnerabilities: { high: 1 } },
});

test('fails on a high or critical advisory nothing allows', () => {
  const verdict = verdictOf(
    auditOf(advisory('GHSA-1', 'high'), advisory('GHSA-2', 'critical')),
    [],
    '2026-11-14',
  );
  assert.equal(verdict.refused.length, 2);
  assert.deepEqual(verdict.expired, []);
});

test('lets an allowed one pass until its date, and fails it after', () => {
  const allowlist = [{ advisory: 'GHSA-1', until: '2026-12-15' }];
  assert.deepEqual(
    verdictOf(auditOf(advisory('GHSA-1', 'high')), allowlist, '2026-12-15').refused,
    [],
  );
  assert.deepEqual(
    verdictOf(auditOf(advisory('GHSA-1', 'high')), allowlist, '2026-12-15').expired,
    [],
  );
  assert.equal(
    verdictOf(auditOf(advisory('GHSA-1', 'high')), allowlist, '2026-12-16').expired.length,
    1,
  );
});

test('never fails on a moderate or low advisory', () => {
  const verdict = verdictOf(
    auditOf(advisory('GHSA-3', 'moderate'), advisory('GHSA-4', 'low')),
    [],
    '2026-11-14',
  );
  assert.deepEqual(verdict, { refused: [], expired: [], counts: { high: 1 } });
});

test('counts one advisory once, however many paths reach it', () => {
  const verdict = verdictOf(
    auditOf(advisory('GHSA-1', 'high'), advisory('GHSA-1', 'high')),
    [],
    '2026-11-14',
  );
  assert.equal(verdict.refused.length, 1);
});
