/**
 * When will the next snapshot be live? The page shows a countdown to it.
 *
 * The workflow file is the single source of truth for the schedule, so the
 * countdown can't drift from the real cron if someone changes it.
 *
 * GitHub runs scheduled workflows on a best-effort basis: they often start
 * late, and under load some are skipped entirely. The page therefore gets the
 * whole schedule (not just "the next run"), so it can move on to the following
 * slot when one never happens instead of waiting on it forever.
 */

/** Rough time from the cron firing to the new snapshot being served by Pages. */
export const DEPLOY_LAG_MS = 3 * 60 * 1000;

/**
 * Minutes-of-the-hour from an every-hour cron: `'7 * * * *'` -> [7],
 * `'17,47 * * * *'` -> [17, 47]. Returns null for anything else.
 */
export function cronMinutes(workflowYaml) {
  const m = workflowYaml.match(/cron:\s*['"]\s*(\d{1,2}(?:,\d{1,2})*)\s+\*\s+\*\s+\*\s+\*\s*['"]/);
  if (!m) return null;
  const minutes = [...new Set(m[1].split(',').map(Number))].sort((a, b) => a - b);
  return minutes.every((n) => n >= 0 && n < 60) ? minutes : null;
}

/** The first run strictly after `now` (ms, UTC) for the given minutes-of-the-hour. */
export function nextRun(now, minutes) {
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  for (let h = 0; h <= 1; h++) {
    for (const minute of minutes) {
      const t = hour.getTime() + h * 3600 * 1000 + minute * 60 * 1000;
      if (t > now) return t;
    }
  }
  throw new Error('unreachable: minutes must be non-empty');
}

/**
 * Schedule info for the snapshot, or null if the cron isn't a simple
 * every-hour schedule:
 *   { minutes, deployLagMinutes, nextUpdateAt }
 */
export function scheduleInfo(workflowYaml, now) {
  const minutes = cronMinutes(workflowYaml);
  if (!minutes?.length) return null;
  return {
    minutes,
    deployLagMinutes: DEPLOY_LAG_MS / 60000,
    nextUpdateAt: new Date(nextRun(now, minutes) + DEPLOY_LAG_MS).toISOString(),
  };
}
