import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const REALM = 'Aqsha AI Admin';

/**
 * Internal access protection for the admin dashboard.
 *
 * Uses HTTP Basic Auth against the ADMIN_SECRET environment variable.
 * The username is ignored — only the password is checked.
 *
 * Behaviour:
 *   - ADMIN_SECRET not set          → 503 (fail-safe, not an open door)
 *   - Missing or wrong credentials  → 401 + WWW-Authenticate header
 *   - Correct password              → request passes through
 *
 * /api/health is excluded via the matcher and stays open for health checks.
 */
export function middleware(request: NextRequest): NextResponse {
  const secret = process.env.ADMIN_SECRET;

  // Fail-safe: block all access when the secret is not configured.
  if (!secret) {
    return new NextResponse('ADMIN_SECRET is not configured.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const authHeader = request.headers.get('authorization') ?? '';

  if (authHeader.startsWith('Basic ')) {
    const encoded = authHeader.slice('Basic '.length);

    let decoded: string;
    try {
      decoded = atob(encoded);
    } catch {
      decoded = '';
    }

    // Basic auth format: "username:password" — only the password is validated.
    const colonIndex = decoded.indexOf(':');
    const password = colonIndex >= 0 ? decoded.slice(colonIndex + 1) : decoded;

    if (password === secret) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}"`,
      'Content-Type': 'text/plain',
    },
  });
}

export const config = {
  matcher: [
    /**
     * Protect all routes except:
     *   /api/health  — Render / uptime health checks
     *   /_next/*     — Next.js static assets and image optimisation
     *   /favicon.ico — browser favicon request
     */
    '/((?!api/health|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
