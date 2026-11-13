// D9-4 (Phase 9 Slice 9.7): the dependency audit's gate. `pnpm audit --prod --json` lists what the production
// dependencies are known to be open to; any high or critical advisory fails CI unless .github/audit-allowlist.json names
// it with a reason and a date it must be dealt with by, and that date hasn't passed. Moderate and low ones are counted,
// never failed on. An audit that couldn't be read fails too: a gate that can't see doesn't pass.
//
//   pnpm audit --prod --json > audit.json; node .github/scripts/audit-gate.mjs audit.json
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL, pathToFileURL } from 'node:url';

const SERIOUS = new Set(['high', 'critical']);

/**
 * What the gate says of an audit: the serious advisories nothing allows, the allowances past their date, and the counts
 * by severity. `today` is a calendar day, YYYY-MM-DD.
 */
export function verdictOf(audit, allowlist, today) {
  const allowed = new Map(allowlist.map((entry) => [entry.advisory, entry]));
  const refused = [];
  const expired = [];
  const seen = new Set();
  for (const advisory of Object.values(audit.advisories ?? {})) {
    if (!SERIOUS.has(advisory.severity)) continue;
    const id = advisory.github_advisory_id ?? String(advisory.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const allowance = allowed.get(id);
    const line = `${advisory.severity} ${advisory.module_name} ${id}: ${advisory.title}`;
    if (allowance === undefined) refused.push(line);
    else if (allowance.until < today) expired.push(`${line} (allowed until ${allowance.until})`);
  }
  return { refused, expired, counts: audit.metadata?.vulnerabilities ?? {} };
}

function run() {
  const [auditPath] = process.argv.slice(2);
  let audit;
  try {
    audit = JSON.parse(readFileSync(auditPath, 'utf8'));
  } catch (error) {
    process.stderr.write(`the audit couldn't be read (${String(error)}): failing\n`);
    process.exit(1);
  }
  if (audit.error) {
    process.stderr.write(`the audit failed: ${JSON.stringify(audit.error)}\n`);
    process.exit(1);
  }
  const allowlist = JSON.parse(
    readFileSync(new URL('../audit-allowlist.json', import.meta.url), 'utf8'),
  );
  const today = new Date().toISOString().slice(0, 10);
  const { refused, expired, counts } = verdictOf(audit, allowlist, today);
  process.stdout.write(`production dependencies' advisories: ${JSON.stringify(counts)}\n`);
  for (const line of refused) process.stdout.write(`NOT ALLOWED  ${line}\n`);
  for (const line of expired) process.stdout.write(`EXPIRED      ${line}\n`);
  if (refused.length > 0 || expired.length > 0) {
    process.stdout.write(
      'Upgrade the package, or add it to .github/audit-allowlist.json with a reason and a date.\n',
    );
    process.exit(1);
  }
  process.stdout.write('no high or critical advisory but those allowed until their date\n');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) run();
