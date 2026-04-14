export { createAuthRouter } from './routes.js';
export type { AuthDeps } from './routes.js';
export { requireAuth } from './middleware.js';
export type { AuthenticatedRequest } from './middleware.js';
export { signToken, verifyToken } from './jwt.js';
export type { TokenPayload } from './jwt.js';
