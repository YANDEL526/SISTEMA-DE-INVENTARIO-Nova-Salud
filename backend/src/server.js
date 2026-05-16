import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import pool, { initializeDatabase } from './db.js';
import { authRequired, optionalAuth, requireRole, signToken } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos. Intenta nuevamente en unos minutos.' },
});

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

function publicUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
  };
}

function text(value) {
  return String(value ?? '').trim();
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertPositiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw httpError(400, `${field} debe ser mayor que 0`);
  }
  return Number(number.toFixed(2));
}

function assertNonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw httpError(400, `${field} debe ser un numero entero mayor o igual que 0`);
  }
  return number;
}

function normalizeProductPayload(body) {
  const codigo = text(body.codigo).toUpperCase();
  const nombre = text(body.nombre);
  const categoria = text(body.categoria);
  const proveedor = text(body.proveedor) || null;
  const fechaVencimiento = text(body.fecha_vencimiento) || null;

  if (!codigo || !nombre || !categoria) {
    throw httpError(400, 'Codigo, nombre y categoria son obligatorios');
  }

  return {
    codigo,
    nombre,
    categoria,
    precio: assertPositiveNumber(body.precio, 'El precio'),
    stock_actual: assertNonNegativeInteger(body.stock_actual, 'El stock actual'),
    stock_minimo: assertNonNegativeInteger(body.stock_minimo, 'El stock minimo'),
    proveedor,
    fecha_vencimiento: fechaVencimiento,
  };
}

function mapProduct(product) {
  return {
    ...product,
    precio: Number(product.precio),
    stock_actual: Number(product.stock_actual),
    stock_minimo: Number(product.stock_minimo),
    bajo_stock: Number(product.stock_actual) <= Number(product.stock_minimo),
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: rows[0].ok === 1 });
  } catch {
    res.status(500).json({ ok: false, message: 'Error de conexion a la base de datos' });
  }
});

app.post('/api/auth/register', authLimiter, optionalAuth, async (req, res, next) => {
  try {
    const nombre = text(req.body.nombre);
    const email = text(req.body.email).toLowerCase();
    const password = String(req.body.password ?? '');
    const requestedRole = req.body.rol === 'admin' ? 'admin' : 'vendedor';

    if (!nombre || !email || !password) {
      return res.status(400).json({ message: 'Nombre, correo y contraseña son obligatorios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
    const userCount = Number(countRows[0].total);

    if (userCount > 0 && (!req.user || req.user.rol !== 'admin')) {
      return res.status(403).json({ message: 'Solo un administrador puede crear nuevos usuarios' });
    }

    const role = userCount === 0 ? 'admin' : requestedRole;
    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (nombre, email, password_hash, rol)
       VALUES (?, ?, ?, ?)`,
      [nombre, email, passwordHash, role]
    );

    const user = { id: result.insertId, nombre, email, rol: role };
    const token = signToken(user);

    res.status(201).json({
      message: userCount === 0 ? 'Administrador inicial creado' : 'Usuario creado correctamente',
      token: userCount === 0 ? token : undefined,
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El correo ya esta registrado' });
    }
    next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = text(req.body.email).toLowerCase();
    const password = String(req.body.password ?? '');

    const [rows] = await pool.query(
      `SELECT id, nombre, email, password_hash, rol, activo
       FROM users
       WHERE email = ? AND activo = 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    const user = rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    res.json({
      message: 'Login exitoso',
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/users', authRequired, requireRole('admin'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, activo, created_at
       FROM users
       ORDER BY id DESC`
    );
    res.json(rows.map(publicUser));
  } catch (error) {
    next(error);
  }
});

app.get('/api/products', authRequired, async (req, res, next) => {
  try {
    const search = text(req.query.search);
    const params = [];
    let where = 'WHERE activo = 1';

    if (search) {
      where += ' AND (codigo LIKE ? OR nombre LIKE ? OR categoria LIKE ? OR proveedor LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const [rows] = await pool.query(
      `SELECT id, codigo, nombre, categoria, precio, stock_actual, stock_minimo,
              proveedor, fecha_vencimiento, activo, created_at, updated_at
       FROM products
       ${where}
       ORDER BY bajo_stock DESC, nombre ASC`.replace(
        'bajo_stock',
        '(stock_actual <= stock_minimo)'
      ),
      params
    );

    res.json(rows.map(mapProduct));
  } catch (error) {
    next(error);
  }
});

app.post('/api/products', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const product = normalizeProductPayload(req.body);
    const [result] = await pool.query(
      `INSERT INTO products
       (codigo, nombre, categoria, precio, stock_actual, stock_minimo, proveedor, fecha_vencimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.codigo,
        product.nombre,
        product.categoria,
        product.precio,
        product.stock_actual,
        product.stock_minimo,
        product.proveedor,
        product.fecha_vencimiento,
      ]
    );

    if (product.stock_actual > 0) {
      await pool.query(
        `INSERT INTO stock_movements (product_id, user_id, tipo, cantidad, motivo, referencia)
         VALUES (?, ?, 'entrada', ?, 'Stock inicial', ?)`,
        [result.insertId, req.user.id, product.stock_actual, `PRODUCT-${result.insertId}`]
      );
    }

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json(mapProduct(rows[0]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ya existe un producto con ese codigo' });
    }
    next(error);
  }
});

app.put('/api/products/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const product = normalizeProductPayload(req.body);

    await connection.beginTransaction();
    const [currentRows] = await connection.query(
      'SELECT id, stock_actual FROM products WHERE id = ? AND activo = 1 FOR UPDATE',
      [id]
    );

    if (currentRows.length === 0) {
      throw httpError(404, 'Producto no encontrado');
    }

    const previousStock = Number(currentRows[0].stock_actual);

    await connection.query(
      `UPDATE products
       SET codigo = ?, nombre = ?, categoria = ?, precio = ?, stock_actual = ?,
           stock_minimo = ?, proveedor = ?, fecha_vencimiento = ?
       WHERE id = ?`,
      [
        product.codigo,
        product.nombre,
        product.categoria,
        product.precio,
        product.stock_actual,
        product.stock_minimo,
        product.proveedor,
        product.fecha_vencimiento,
        id,
      ]
    );

    const stockDifference = product.stock_actual - previousStock;
    if (stockDifference !== 0) {
      await connection.query(
        `INSERT INTO stock_movements (product_id, user_id, tipo, cantidad, motivo, referencia)
         VALUES (?, ?, 'ajuste', ?, 'Ajuste manual de inventario', ?)`,
        [id, req.user.id, stockDifference, `PRODUCT-${id}`]
      );
    }

    const [rows] = await connection.query('SELECT * FROM products WHERE id = ?', [id]);
    await connection.commit();
    res.json(mapProduct(rows[0]));
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Ya existe un producto con ese codigo' });
    }
    next(error);
  } finally {
    connection.release();
  }
});

app.delete('/api/products/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const [result] = await pool.query('UPDATE products SET activo = 0 WHERE id = ? AND activo = 1', [
      req.params.id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto desactivado correctamente' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/alerts/low-stock', authRequired, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, codigo, nombre, categoria, precio, stock_actual, stock_minimo,
              proveedor, fecha_vencimiento, activo, created_at, updated_at
       FROM products
       WHERE activo = 1 AND stock_actual <= stock_minimo
       ORDER BY (stock_minimo - stock_actual) DESC, nombre ASC`
    );
    res.json(rows.map(mapProduct));
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', authRequired, async (_req, res, next) => {
  try {
    const [[productStats], [salesStats], [stockStats], [userStats]] = await Promise.all([
      pool.query(
        `SELECT
          COUNT(*) AS productos_activos,
          SUM(CASE WHEN stock_actual <= stock_minimo THEN 1 ELSE 0 END) AS alertas_stock
         FROM products
         WHERE activo = 1`
      ),
      pool.query(
        `SELECT COUNT(*) AS ventas_hoy, COALESCE(SUM(total), 0) AS total_hoy
         FROM sales
         WHERE DATE(created_at) = CURDATE()`
      ),
      pool.query(
        `SELECT COALESCE(SUM(stock_actual), 0) AS unidades_disponibles
         FROM products
         WHERE activo = 1`
      ),
      pool.query('SELECT COUNT(*) AS usuarios_activos FROM users WHERE activo = 1'),
    ]);

    res.json({
      productos_activos: Number(productStats[0].productos_activos || 0),
      alertas_stock: Number(productStats[0].alertas_stock || 0),
      ventas_hoy: Number(salesStats[0].ventas_hoy || 0),
      total_hoy: Number(salesStats[0].total_hoy || 0),
      unidades_disponibles: Number(stockStats[0].unidades_disponibles || 0),
      usuarios_activos: Number(userStats[0].usuarios_activos || 0),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/sales', authRequired, async (req, res, next) => {
  try {
    const params = [];
    const conditions = [];
    const from = text(req.query.from);
    const to = text(req.query.to);
    const search = text(req.query.search);

    if (from) {
      conditions.push('DATE(s.created_at) >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('DATE(s.created_at) <= ?');
      params.push(to);
    }
    if (search) {
      conditions.push('(s.cliente LIKE ? OR u.nombre LIKE ? OR p.nombre LIKE ? OR p.codigo LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT
        s.id,
        s.cliente,
        s.metodo_pago,
        s.total,
        s.created_at,
        u.nombre AS vendedor,
        COUNT(si.id) AS items,
        GROUP_CONCAT(CONCAT(p.nombre, ' x', si.cantidad) SEPARATOR ', ') AS resumen
       FROM sales s
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN sale_items si ON si.sale_id = s.id
       INNER JOIN products p ON p.id = si.product_id
       ${where}
       GROUP BY s.id, s.cliente, s.metodo_pago, s.total, s.created_at, u.nombre
       ORDER BY s.created_at DESC
       LIMIT 80`,
      params
    );

    res.json(
      rows.map((sale) => ({
        ...sale,
        total: Number(sale.total),
        items: Number(sale.items),
      }))
    );
  } catch (error) {
    next(error);
  }
});

app.post('/api/sales', authRequired, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const cliente = text(req.body.cliente) || 'Cliente mostrador';
    const metodoPago = ['efectivo', 'tarjeta', 'yape', 'transferencia'].includes(req.body.metodo_pago)
      ? req.body.metodo_pago
      : 'efectivo';
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (items.length === 0) {
      throw httpError(400, 'Agrega al menos un producto a la venta');
    }

    await connection.beginTransaction();

    const saleDetails = [];
    for (const item of items) {
      const productId = Number(item.product_id ?? item.id);
      const cantidad = Number(item.cantidad ?? item.quantity);

      if (!Number.isInteger(productId) || productId <= 0) {
        throw httpError(400, 'Producto invalido en la venta');
      }
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw httpError(400, 'La cantidad de venta debe ser mayor que 0');
      }

      const [productRows] = await connection.query(
        `SELECT id, codigo, nombre, precio, stock_actual, activo
         FROM products
         WHERE id = ? AND activo = 1
         FOR UPDATE`,
        [productId]
      );

      if (productRows.length === 0) {
        throw httpError(404, 'Uno de los productos ya no esta disponible');
      }

      const product = productRows[0];
      if (Number(product.stock_actual) < cantidad) {
        throw httpError(409, `${product.nombre} no tiene stock suficiente`);
      }

      const precioUnitario = Number(product.precio);
      saleDetails.push({
        product_id: product.id,
        nombre: product.nombre,
        cantidad,
        precio_unitario: precioUnitario,
        subtotal: Number((precioUnitario * cantidad).toFixed(2)),
      });
    }

    const total = Number(saleDetails.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));

    const [saleResult] = await connection.query(
      `INSERT INTO sales (user_id, cliente, metodo_pago, total)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, cliente, metodoPago, total]
    );

    for (const item of saleDetails) {
      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [saleResult.insertId, item.product_id, item.cantidad, item.precio_unitario, item.subtotal]
      );

      await connection.query(
        'UPDATE products SET stock_actual = stock_actual - ? WHERE id = ?',
        [item.cantidad, item.product_id]
      );

      await connection.query(
        `INSERT INTO stock_movements (product_id, user_id, tipo, cantidad, motivo, referencia)
         VALUES (?, ?, 'salida', ?, 'Venta registrada', ?)`,
        [item.product_id, req.user.id, item.cantidad, `SALE-${saleResult.insertId}`]
      );
    }

    await connection.commit();
    res.status(201).json({
      message: 'Venta registrada correctamente',
      sale: {
        id: saleResult.insertId,
        cliente,
        metodo_pago: metodoPago,
        total,
        items: saleDetails,
      },
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ message: err.message || 'Error del servidor' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API Nova Salud corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo inicializar la base de datos:', error);
    process.exit(1);
  });
