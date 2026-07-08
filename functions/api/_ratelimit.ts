import { Env } from './_db';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(
  env: Env,
  {
    key,
    limit,
    durationSeconds,
  }: {
    key: string;
    limit: number;
    durationSeconds: number;
  }
): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = nowSec + durationSeconds;

  // 1. Try using Cloudflare KV if available and bound
  if (env.CLARO_KV && typeof env.CLARO_KV.get === 'function' && typeof env.CLARO_KV.put === 'function') {
    try {
      const kvKey = `ratelimit:${key}`;
      const cached = await env.CLARO_KV.get(kvKey, { type: 'json' }) as { value: number; expires: number } | null;

      if (cached && cached.expires > nowSec) {
        if (cached.value >= limit) {
          return { allowed: false, remaining: 0 };
        }
        const newValue = cached.value + 1;
        const timeToLive = cached.expires - nowSec;
        await env.CLARO_KV.put(kvKey, JSON.stringify({ value: newValue, expires: cached.expires }), {
          expirationTtl: Math.max(60, timeToLive)
        });
        return { allowed: true, remaining: Math.max(0, limit - newValue) };
      } else {
        await env.CLARO_KV.put(kvKey, JSON.stringify({ value: 1, expires: expiresAt }), {
          expirationTtl: Math.max(60, durationSeconds)
        });
        return { allowed: true, remaining: limit - 1 };
      }
    } catch (kvErr) {
      console.error("KV Rate Limit Error, falling back to D1:", kvErr);
    }
  }

  // 2. Fallback to D1 Database rate_limits table
  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        "SELECT value, expires_at FROM rate_limits WHERE key = ?"
      ).bind(key).first() as { value: number; expires_at: number } | null;

      if (row) {
        if (row.expires_at > nowSec) {
          if (row.value >= limit) {
            return { allowed: false, remaining: 0 };
          }
          const newValue = row.value + 1;
          await env.DB.prepare(
            "UPDATE rate_limits SET value = ? WHERE key = ?"
          ).bind(newValue, key).run();
          return { allowed: true, remaining: Math.max(0, limit - newValue) };
        } else {
          // Expired, reset
          await env.DB.prepare(
            "UPDATE rate_limits SET value = 1, expires_at = ? WHERE key = ?"
          ).bind(expiresAt, key).run();
          return { allowed: true, remaining: limit - 1 };
        }
      } else {
        // Insert new
        await env.DB.prepare(
          "INSERT OR REPLACE INTO rate_limits (key, value, expires_at) VALUES (?, 1, ?)"
        ).bind(key, expiresAt).run();
        return { allowed: true, remaining: limit - 1 };
      }
    } catch (d1Err) {
      console.error("D1 Rate Limit Error:", d1Err);
      // In production, we never block the user if the rate limit infrastructure fails
      return { allowed: true, remaining: 1 };
    }
  }

  // If no DB or KV, default to allow
  return { allowed: true, remaining: 1 };
}

/**
 * Convenience function to apply rate limits based on action types
 */
export async function applyRateLimit(
  env: Env,
  type: 'login' | 'upload' | 'ia' | 'general',
  identifier: string
): Promise<RateLimitResult> {
  let limit = 100;
  let durationSeconds = 60; // 1 minute default

  switch (type) {
    case 'login':
      limit = 20;
      durationSeconds = 60;
      break;
    case 'upload':
      limit = 5;
      durationSeconds = 60;
      break;
    case 'ia':
      limit = 10;
      durationSeconds = 86400; // 1 day
      break;
    case 'general':
    default:
      limit = 100;
      durationSeconds = 60;
      break;
  }

  const key = `${type}:${identifier}`;
  return checkRateLimit(env, { key, limit, durationSeconds });
}
