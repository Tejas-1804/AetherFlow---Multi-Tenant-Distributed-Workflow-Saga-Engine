import { NextFunction, Request, Response } from 'express';
import { MultiTenantMongoManager } from '../db/mongo-manager.js';

export interface TenantContextRequest extends Request {
  tenantId?: string;
  tenantConfig?: any;
  userRole?: string;
  userEmail?: string;
  authMethod?: 'api_key' | 'jwt' | 'header';
}

// In-Memory sliding-window rate limiter per tenant
interface RateLimitBucket {
  tokens: number;
  lastRefillTime: number;
  requestCountInWindow: number;
  windowStart: number;
}

const tenantRateBuckets = new Map<string, RateLimitBucket>();

export function createTenantMiddleware() {
  const dbManager = MultiTenantMongoManager.getInstance();

  return async (req: TenantContextRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Resolve Tenant ID from: Header -> Query -> Default fallback
      const headerTenant = req.headers['x-tenant-id'] as string;
      const queryTenant = req.query.tenantId as string;
      const tenantId = headerTenant || queryTenant || 'acme_logistics';

      // 2. Fetch Tenant Configuration
      const tenantConfig = await dbManager.getTenantConfig(tenantId);
      if (!tenantConfig) {
        res.status(404).json({
          error: 'TENANT_NOT_FOUND',
          message: `Tenant identifier "${tenantId}" is not registered in the system.`,
        });
        return;
      }

      req.tenantId = tenantId;
      req.tenantConfig = tenantConfig;

      // 3. Sliding-Window Rate Limiting per Tenant
      const rateLimits = tenantConfig.rateLimit || { maxRequestsPerMin: 120, burstLimit: 30 };
      const now = Date.now();
      const windowDurationMs = 60 * 1000;

      let bucket = tenantRateBuckets.get(tenantId);
      if (!bucket || now - bucket.windowStart > windowDurationMs) {
        bucket = {
          tokens: rateLimits.burstLimit,
          lastRefillTime: now,
          requestCountInWindow: 0,
          windowStart: now,
        };
        tenantRateBuckets.set(tenantId, bucket);
      }

      // Check request limits
      bucket.requestCountInWindow++;
      const remaining = Math.max(0, rateLimits.maxRequestsPerMin - bucket.requestCountInWindow);
      const resetTimeSeconds = Math.ceil((bucket.windowStart + windowDurationMs - now) / 1000);

      // Set standard RFC rate-limiting headers
      res.setHeader('X-RateLimit-Limit', rateLimits.maxRequestsPerMin.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTimeSeconds.toString());
      res.setHeader('X-Tenant-Isolation-Strategy', tenantConfig.isolationStrategy);

      if (bucket.requestCountInWindow > rateLimits.maxRequestsPerMin) {
        res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Tenant "${tenantConfig.name}" has exceeded its rate limit quota (${rateLimits.maxRequestsPerMin} req/min). Retry in ${resetTimeSeconds}s.`,
          retryAfter: resetTimeSeconds,
        });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({
        error: 'TENANT_CONTEXT_ERROR',
        message: err.message || 'Failed to establish tenant execution context.',
      });
    }
  };
}
