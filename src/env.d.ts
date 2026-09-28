// Secrets for the resale tool. Set in production with `wrangler secret put`,
// and locally in an uncommitted .dev.vars file.
declare namespace Cloudflare {
  interface Env {
    RESALE_PASSWORD: string;
    SESSION_SECRET: string;
    ANTHROPIC_API_KEY: string;
  }
}
