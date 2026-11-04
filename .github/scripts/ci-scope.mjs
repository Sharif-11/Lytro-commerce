// What a pull request can make fail, so ci.yml runs only those checks. Turborepo follows the package graph; these rules
// add what the graph can't see. Anything they can't place runs everything, and so does any error here: a slower run is
// the worst a mistake in this file should cost.
import { execFileSync, execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Turborepo maps a file in apps/ or packages/ to its package; no check reads docs or a root Markdown file, apart from the
// prototypes below. A file anywhere else (a workflow, the lockfile, a root config) can change what every check does.
const PLACED = [/^docs\//, /^apps\//, /^packages\//, /^[^/]+\.md$/];

// The files outside a package that its tests read: each browser suite draws its screens beside its prototype.
const DASHBOARD_PROTOTYPE = 'docs/brand/lytro-dashboard.html';
const STOREFRONT_PROTOTYPE = 'docs/brand/lytro-storefront.html';

function everything(why) {
  return {
    affected: '',
    code: true,
    browser: true,
    dashboard: true,
    storefront: true,
    walkthrough: true,
    why,
  };
}

/** The checks for a pull request, from the files it changes and the packages Turborepo says those reach. */
export function scopeOf(changed, reached) {
  if (changed.length === 0) return everything('There is nothing to compare');
  const unplaced = changed.find((path) => !PLACED.some((place) => place.test(path)));
  if (unplaced !== undefined) return everything(`${unplaced} is outside every package`);
  const has = (name) => reached.includes(`@lytronix/${name}`);
  const dashboard = has('dashboard') || changed.includes(DASHBOARD_PROTOTYPE);
  const storefront = has('storefront') || changed.includes(STOREFRONT_PROTOTYPE);
  // The walkthrough is the one browser test against the real server; the other two mock it.
  const walkthrough = has('dashboard') || has('server');
  return {
    affected: '--affected',
    code: reached.length > 0 || dashboard || storefront,
    browser: dashboard || storefront || walkthrough,
    dashboard,
    storefront,
    walkthrough,
    why: `This change reaches ${reached.join(', ') || 'no package'}`,
  };
}

function scopeOfThisRun() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request')
    return everything('This is not a pull request');
  const base = process.env.TURBO_SCM_BASE;
  // Without renames, so moving a file out of a place that needs checks still counts as changing it.
  const changed = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const answer = execSync('pnpm exec turbo query affected --packages', { encoding: 'utf8' });
  const packages = JSON.parse(answer.slice(answer.indexOf('{'))).data.affectedPackages.items;
  return scopeOf(
    changed,
    packages.map((item) => item.name).filter((name) => name !== '//'),
  );
}

function run() {
  let scope;
  try {
    scope = scopeOfThisRun();
  } catch (error) {
    scope = everything(`The comparison failed: ${String(error)}`);
  }
  const { why, ...outputs } = scope;
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${String(value)}`);
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  const shown = [
    ['Typecheck, build', scope.code],
    ['Lint, unit and server tests', scope.code ? scope.affected || 'all' : false],
    ['Dashboard browser tests', scope.dashboard],
    ['Storefront browser tests', scope.storefront],
    ['Walkthrough against the real server', scope.walkthrough],
  ].map(([check, runs]) => `| ${check} | ${runs === false ? 'skipped' : String(runs)} |`);
  const summary = [`${why}.`, '', '| Check | Runs |', '| --- | --- |', ...shown, ''];
  process.stdout.write(`${summary.join('\n')}\n`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) run();
