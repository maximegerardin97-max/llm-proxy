// Supabase JWTs are signed by GoTrue with a secret; for simplicity, verify via /auth/v1/user endpoint using supabase-js
import { supabasePublic } from '../db/supabase.js';

export async function requireAuth(req, res, next) {
  try {
    // Dev fallback: allow x-dev-user-id when running in development
    if (process.env.NODE_ENV === 'development') {
      const devUserIdHeader = req.headers['x-dev-user-id'];
      if (devUserIdHeader && typeof devUserIdHeader === 'string' && devUserIdHeader.length > 0) {
        // Accept UUIDs; otherwise use a fixed dev UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const devUuid = uuidRegex.test(devUserIdHeader)
          ? devUserIdHeader
          : '11111111-1111-1111-1111-111111111111';
        req.user = { id: devUuid, email: null };
        return next();
      }
    }

    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const accessToken = authHeader.slice('Bearer '.length);

    if (!supabasePublic) {
      return res.status(500).json({ error: 'Auth is not configured on the server' });
    }

    // Validate token by calling getUser on supabase-js (does not need network if using jwt secret; but here it will call Supabase)
    const { data, error } = await supabasePublic.auth.getUser(accessToken);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}


