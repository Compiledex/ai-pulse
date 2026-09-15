/**
 * A reliable clock for AI Pulse.
 *
 * GitHub runs scheduled workflows on a best-effort basis and dropped most of
 * this repo's: in the first 14 hours only two of ~28 scheduled builds started.
 * This Cloudflare Worker fires on a Cron Trigger (which Cloudflare runs on
 * time) and asks GitHub to start the build through the workflow_dispatch API.
 *
 * Secret: GITHUB_TOKEN — a fine-grained token limited to Compiledex/ai-pulse
 * with "Actions: Read and write". Nothing else.
 */

const DISPATCH_URL = 'https://api.github.com/repos/Compiledex/ai-pulse/actions/workflows/build.yml/dispatches';

async function dispatch(env) {
  const res = await fetch(DISPATCH_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'ai-pulse-scheduler',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  // 204 No Content means GitHub accepted it.
  if (res.status !== 204) throw new Error(`GitHub answered ${res.status}: ${await res.text()}`);
  console.log('Build dispatched');
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(env));
  },
};
