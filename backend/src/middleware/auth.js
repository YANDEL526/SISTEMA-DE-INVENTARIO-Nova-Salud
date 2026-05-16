import jwt from 'jsonwebtoken';
import pool from '../db.js';

const jwtSecret = process.env.JWT_SECRET || 'nova_salud_dev_secret_change_me';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '2h';

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      rol: user.rol,
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

async function loadUserFromToken(token) {
  const payload = jwt.verify(token, jwtSecret);
  const [rows] = await pool.query(
    `SELECT id, nombre, email, rol, activo
     FROM users
     WHERE id = ? AND activo = 1`,
    [payload.id]
  );

  return rows[0] || null;
}

export async function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Token de acceso requerido' });
    }

    const user = await loadUserFromToken(token);
    if (!user) {
      return res.status(401).json({ message: 'Token invalido o usuario inactivo' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Sesion expirada o token invalido' });
  }
}

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader) {
    return next();
  }

  return authRequired(req, res, next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ message: 'No tienes permisos para esta accion' });
    }

    next();
  };
}
