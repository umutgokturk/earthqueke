import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppEnv } from '@ils/config';

export const ADMIN_COOKIE = 'ils_admin';

export interface AdminAuth {
  verifyCredentials(username: string, password: string): Promise<boolean>;
  requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  /** CSRF guard for mutating admin routes: a custom header must be present. */
  requireAdminMutation(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}

/**
 * Admin authentication.
 *  - Credentials: ADMIN_USERNAME + bcrypt ADMIN_PASSWORD_HASH (preferred).
 *    A plaintext ADMIN_PASSWORD is hashed in memory at startup and never
 *    stored; production requires one of the two (enforced by loadEnv).
 *  - Session: signed JWT in an httpOnly SameSite=Lax cookie.
 *  - CSRF: mutations additionally require the `x-ils-admin: 1` header, which
 *    cross-site forms cannot set.
 */
export function createAdminAuth(app: FastifyInstance, env: AppEnv): AdminAuth {
  let passwordHash: string;
  if (env.ADMIN_PASSWORD_HASH) {
    passwordHash = env.ADMIN_PASSWORD_HASH;
  } else if (env.ADMIN_PASSWORD) {
    passwordHash = bcrypt.hashSync(env.ADMIN_PASSWORD, 12);
  } else {
    // development fallback only (loadEnv rejects this combination in production)
    passwordHash = bcrypt.hashSync('admin', 12);
    app.log.warn(
      'No ADMIN_PASSWORD / ADMIN_PASSWORD_HASH configured — using development fallback credentials admin/admin',
    );
  }

  async function verifyCredentials(username: string, password: string): Promise<boolean> {
    const userOk = username === env.ADMIN_USERNAME;
    // Always run the compare so response timing does not leak whether the
    // username exists.
    const passOk = await bcrypt.compare(password, passwordHash);
    return userOk && passOk;
  }

  async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ error: 'unauthorized', message: 'Admin oturumu gerekli.' });
    }
  }

  async function requireAdminMutation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAdmin(request, reply);
    if (reply.sent) return;
    if (request.headers['x-ils-admin'] !== '1') {
      await reply.code(403).send({ error: 'forbidden', message: 'CSRF koruması: x-ils-admin başlığı eksik.' });
    }
  }

  return { verifyCredentials, requireAdmin, requireAdminMutation };
}
