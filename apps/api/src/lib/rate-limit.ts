import { tooMany } from "./errors.ts";

/**
 * Limite de tentativas em memória (por instância). Protege login e checkout contra
 * robôs e teste de cartões. Com mais de uma instância, trocar por um contador compartilhado.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  check(key: string, limit: number, windowMs: number, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      if (this.hits.size > 50_000) this.sweep(now);
      return;
    }
    entry.count += 1;
    if (entry.count > limit) throw tooMany();
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }

  reset() {
    this.hits.clear();
  }
}
