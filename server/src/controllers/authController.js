import env from '../config/env.js';
import authService, { resolveUserOrgId } from '../services/authService.js';
import auditService from '../services/auditService.js';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: env.auth.cookieSameSite,
    secure: env.auth.cookieSecure,
    path: '/',
    maxAge: parseExpiryToMs(env.auth.jwtExpiresIn),
  };
}

/** Supports values like '8h', '30m', '1d', '3600'. */
function parseExpiryToMs(value) {
  const match = /^(\d+)([smhd])?$/.exec(String(value).trim());
  if (!match) return 8 * 60 * 60 * 1000;
  const n = Number.parseInt(match[1], 10);
  const unit = match[2] || 's';
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * factor;
}

async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body, req.ip);
    res.cookie(env.auth.cookieName, token, cookieOptions());
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  if (req.user) {
    resolveUserOrgId(req.user.id).then((orgId) => {
      auditService.log({
        organizationId: orgId,
        actorUserId: req.user.id,
        action: 'auth.logout',
        resourceType: 'auth',
        resourceId: req.user.id,
        outcome: 'success',
        ipAddress: req.ip,
      }).catch(() => {});
    }).catch(() => {});
  }

  // Invalidate the client's authentication state by clearing the cookie.
  res.clearCookie(env.auth.cookieName, {
    httpOnly: true,
    sameSite: env.auth.cookieSameSite,
    secure: env.auth.cookieSecure,
    path: '/',
  });
  res.status(200).json({ success: true, data: { message: 'Logged out' } });
}

function me(req, res) {
  res.status(200).json({ success: true, data: { user: req.user } });
}

async function updateProfile(req, res, next) {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const result = await authService.changePassword(req.user.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export default { login, logout, me, updateProfile, changePassword };
