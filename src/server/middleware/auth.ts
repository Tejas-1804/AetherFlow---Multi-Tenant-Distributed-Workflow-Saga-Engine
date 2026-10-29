import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { MultiTenantMongoManager } from '../db/mongo-manager.js';
import { TenantContextRequest } from './tenant-context.js';

const JWT_SECRET = process.env.JWT_SECRET || 'enterprise_workflow_orchestration_jwt_secret_2026';

export interface UserTokenPayload {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'TENANT_OPERATOR' | 'DEVELOPER';
  tenantId: string;
}

export function generateJwtToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function createAuthMiddleware() {
  const dbManager = MultiTenantMongoManager.getInstance();

  return async (req: TenantContextRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;

    // 1. API Key Authentication (Highest priority for programmatic / microservice calls)
    if (apiKeyHeader) {
      const verification = await dbManager.verifyApiKey(apiKeyHeader);
      if (!verification.valid) {
        res.status(401).json({ error: 'INVALID_API_KEY', message: 'Provided API key is invalid or revoked.' });
        return;
      }
      req.authMethod = 'api_key';
      req.tenantId = verification.tenantId;
      req.userRole = 'DEVELOPER';
      req.userEmail = `apikey@${verification.tenantId}.service`;
      return next();
    }

    // 2. JWT Bearer Token Authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as UserTokenPayload;
        req.authMethod = 'jwt';
        req.userRole = decoded.role;
        req.userEmail = decoded.email;
        // If tenantId was not overridden, use the token's tenantId
        if (!req.headers['x-tenant-id']) {
          req.tenantId = decoded.tenantId;
        }
        return next();
      } catch (err: any) {
        res.status(401).json({ error: 'INVALID_TOKEN', message: 'Authentication token has expired or is invalid.' });
        return;
      }
    }

    // 3. Fallback for interactive demo dashboard: Set authenticated context from header
    const demoUserRole = (req.headers['x-demo-role'] as string) || 'TENANT_ADMIN';
    const demoEmail = (req.headers['x-demo-email'] as string) || 'tejas@acme.com';
    req.authMethod = 'header';
    req.userRole = demoUserRole as any;
    req.userEmail = demoEmail;
    next();
  };
}

export function requireRole(allowedRoles: string[]) {
  return (req: TenantContextRequest, res: Response, next: NextFunction): void => {
    const role = req.userRole || 'DEVELOPER';
    if (role === 'SUPER_ADMIN' || allowedRoles.includes(role)) {
      return next();
    }
    res.status(403).json({
      error: 'FORBIDDEN',
      message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]. Current role: ${role}`,
    });
  };
}
