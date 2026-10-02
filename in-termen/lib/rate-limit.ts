import "server-only";

/**
 * Limitare simplă de rată, în memoria procesului — SUBSTITUT pentru MVP.
 * Pe Vercel sau pe mai multe instanțe memoria nu este partajată, deci în producție
 * înlocuiește implementarea cu un depozit comun (de ex. Upstash Redis + @upstash/ratelimit),
 * păstrând aceeași semnătură.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export const RATE_LIMITS = {
  upload: { limit: 20, windowMs: 10 * 60 * 1000 },
  auth: { limit: 10, windowMs: 10 * 60 * 1000 },
  ocr: { limit: 10, windowMs: 10 * 60 * 1000 },
  export: { limit: 10, windowMs: 10 * 60 * 1000 },
  destructive: { limit: 5, windowMs: 10 * 60 * 1000 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(name: RateLimitName, key: string, now: number = Date.now()): RateLimitResult {
  const { limit, windowMs } = RATE_LIMITS[name];
  const id = `${name}:${key}`;
  const bucket = buckets.get(id);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

export const RATE_LIMIT_MESSAGE =
  "Ai făcut prea multe încercări într-un timp scurt. Încearcă din nou peste câteva minute.";
