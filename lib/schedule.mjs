/**
 * When will the next snapshot be live? The page shows a countdown to it.
 *
 * The workflow file is the single source of truth for the schedule, so the
 * countdown can't drift from the real cron if someone changes it.
 */

/** Rough time from the cron firing to the new snapshot being served by Pages. */
export const DEPLOY_LAG_MS = 3 * 60 * 1000;

/**
 * Minute-of-the-hour from an hourly cron like `- cron: '7 * * * *'`.
 * Returns null for anything that isn't a simple hourly schedule.
 */
export function hourlyCronMinute(workflowYaml) {
  const m = workflowYaml.match(/cron:\s*['"]\s*(\d{1,2})\s+\*\s+\*\s+\*\s+\*\s*['"]/);
  if (!m) return null;
  const minute = Number(m[1]);
  return minute >= 0 && minute < 60 ? minute : null;
}

/** The first time strictly after `now` where the UTC minute equals `minute`. */
export function nextHourlyRun(now, minute) {
  const next = new Date(now);
  next.setUTCMinutes(minute, 0, 0);
  if (next.getTime() <= now) next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime();
}

/** ISO time the next snapshot should be live, or null if the schedule is unknown. */
export function nextUpdateAt(workflowYaml, now) {
  const minute = hourlyCronMinute(workflowYaml);
  if (minute === null) return null;
  return new Date(nextHourlyRun(now, minute) + DEPLOY_LAG_MS).toISOString();
}
