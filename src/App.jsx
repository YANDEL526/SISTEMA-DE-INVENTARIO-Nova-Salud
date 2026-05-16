import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  Edit3,
  Loader2,
  LogOut,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import './App.css';

const API_BASE = '/api';
const TOKEN_KEY = 'nova_salud_token';
const USER_KEY = 'nova_salud_user';

const emptyProduct = {
  codigo: '',
  nombre: '',
  categoria: '',
  precio: '',
  stock_actual: '',
  stock_minimo: '',
  proveedor: '',
  fecha_vencimiento: '',
};

const emptyUser = {
  nombre: '',
  email: '',
  password: '',
  rol: 'vendedor',
};

const paymentMethods = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'yape', label: 'Yape' },
  { value: 'transferencia', label: 'Transferencia' },
];

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function money(value) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function normalizeProductForm(form) {
  return {
    ...form,
    precio: Number(form.precio),
    stock_actual: Number(form.stock_actual),
    stock_minimo: Number(form.stock_minimo),
    fecha_vencimiento: form.fecha_vencimiento || null,
  };
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => getStoredUser());
  const [booting, setBooting] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [activeView, setActiveView] = useState('dashboard');

  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ nombre: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sales, setSales] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  const [saleSearch, setSaleSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [saleForm, setSaleForm] = useState({ cliente: '', metodo_pago: 'efectivo' });
  const [savingSale, setSavingSale] = useState(false);

  const [userForm, setUserForm] = useState(emptyUser);
  const [savingUser, setSavingUser] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setActiveView('dashboard');
  }, []);

  const request = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && !path.startsWith('/auth/login')) {
          logout();
        }
        throw new Error(data.message || 'No se pudo completar la operacion');
      }

      return data;
    },
    [logout, token]
  );

  const loadWorkspace = useCallback(async () => {
    if (!token || !user) return;

    try {
      setLoadingData(true);
      setError('');
      const [dashboardData, productsData, alertsData, salesData, usersData] = await Promise.all([
        request('/dashboard'),
        request(`/products${productSearch ? `?search=${encodeURIComponent(productSearch)}` : ''}`),
        request('/alerts/low-stock'),
        request('/sales'),
        user.rol === 'admin' ? request('/users') : Promise.resolve([]),
      ]);

      setDashboard(dashboardData);
      setProducts(productsData);
      setAlerts(alertsData);
      setSales(salesData);
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingData(false);
    }
  }, [productSearch, request, token, user]);

  useEffect(() => {
    if (!token) {
      const timer = window.setTimeout(() => setBooting(false), 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    const timer = window.setTimeout(() => {
      request('/auth/me')
        .then((data) => {
          if (!active) return;
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        })
        .catch((err) => {
          if (active) setAuthError(err.message);
        })
        .finally(() => {
          if (active) setBooting(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [request, token]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    const timer = window.setTimeout(() => loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace, token, user]);

  const navItems = useMemo(() => {
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
      { id: 'inventory', label: 'Inventario', icon: Boxes },
      { id: 'sales', label: 'Ventas', icon: ShoppingCart },
      { id: 'alerts', label: 'Alertas', icon: AlertTriangle },
    ];

    if (user?.rol === 'admin') {
      items.push({ id: 'users', label: 'Usuarios', icon: Users });
    }

    return items;
  }, [user]);

  const filteredSaleProducts = useMemo(() => {
    const term = saleSearch.trim().toLowerCase();
    return products
      .filter((product) => Number(product.stock_actual) > 0)
      .filter((product) => {
        if (!term) return true;
        return [product.codigo, product.nombre, product.categoria, product.proveedor]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .slice(0, 8);
  }, [products, saleSearch]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.precio) * Number(item.cantidad), 0),
    [cart]
  );

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const body =
        authMode === 'login'
          ? { email: authForm.email, password: authForm.password }
          : authForm;

      const data = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'No se pudo iniciar sesion');
        return payload;
      });

      if (!data.token) {
        throw new Error('Usuario creado. Inicia sesion con las credenciales registradas.');
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setAuthForm({ nombre: '', email: '', password: '' });
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    setSavingProduct(true);
    setError('');
    setNotice('');

    try {
      const payload = normalizeProductForm(productForm);
      const path = editingProductId ? `/products/${editingProductId}` : '/products';
      const method = editingProductId ? 'PUT' : 'POST';

      await request(path, {
        method,
        body: JSON.stringify(payload),
      });

      setProductForm(emptyProduct);
      setEditingProductId(null);
      setNotice(editingProductId ? 'Producto actualizado.' : 'Producto registrado.');
      await loadWorkspace();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProduct(false);
    }
  };

  const editProduct = (product) => {
    setEditingProductId(product.id);
    setProductForm({
      codigo: product.codigo,
      nombre: product.nombre,
      categoria: product.categoria,
      precio: String(product.precio),
      stock_actual: String(product.stock_actual),
      stock_minimo: String(product.stock_minimo),
      proveedor: product.proveedor || '',
      fecha_vencimiento: product.fecha_vencimiento
        ? String(product.fecha_vencimiento).slice(0, 10)
        : '',
    });
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Desactivar este producto del inventario?')) return;

    try {
      setError('');
      await request(`/products/${id}`, { method: 'DELETE' });
      setNotice('Producto desactivado.');
      await loadWorkspace();
    } catch (err) {
      setError(err.message);
    }
  };

  const addToCart = (product) => {
    setCart((current) => {
      const exists = current.find((item) => item.product_id === product.id);
      if (exists) {
        return current.map((item) =>
          item.product_id === product.id
            ? { ...item, cantidad: Math.min(item.cantidad + 1, product.stock_actual) }
            : item
        );
      }

      return [
        ...current,
        {
          product_id: product.id,
          codigo: product.codigo,
          nombre: product.nombre,
          precio: Number(product.precio),
          stock_actual: Number(product.stock_actual),
          cantidad: 1,
        },
      ];
    });
  };

  const updateCartQuantity = (productId, quantity) => {
    setCart((current) =>
      current.map((item) =>
        item.product_id === productId
          ? {
              ...item,
              cantidad: Math.max(1, Math.min(Number(quantity) || 1, item.stock_actual)),
            }
          : item
      )
    );
  };

  const removeFromCart = (productId) => {
    setCart((current) => current.filter((item) => item.product_id !== productId));
  };

  const submitSale = async (event) => {
    event.preventDefault();
    setSavingSale(true);
    setError('');
    setNotice('');

    try {
      await request('/sales', {
        method: 'POST',
        body: JSON.stringify({
          ...saleForm,
          items: cart.map((item) => ({
            product_id: item.product_id,
            cantidad: item.cantidad,
          })),
        }),
      });

      setCart([]);
      setSaleForm({ cliente: '', metodo_pago: 'efectivo' });
      setNotice('Venta registrada y stock actualizado.');
      await loadWorkspace();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSale(false);
    }
  };

  const submitUser = async (event) => {
    event.preventDefault();
    setSavingUser(true);
    setError('');
    setNotice('');

    try {
      await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userForm),
      });
      setUserForm(emptyUser);
      setNotice('Usuario creado correctamente.');
      await loadWorkspace();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUser(false);
    }
  };

  if (booting) {
    return (
      <div className="center-screen">
        <Loader2 className="spin" size={34} />
        <p>Preparando Nova Salud...</p>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="brand-block">
            <ShieldCheck size={38} />
            <p>Botica Nova Salud</p>
            <h1>Inventario, ventas y atencion en una sola plataforma.</h1>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <span className="eyebrow">Acceso seguro</span>
            <h2>{authMode === 'login' ? 'Iniciar sesion' : 'Crear primer administrador'}</h2>

            {authMode === 'register' && (
              <label>
                Nombre completo
                <input
                  value={authForm.nombre}
                  onChange={(event) => setAuthForm({ ...authForm, nombre: event.target.value })}
                  placeholder="Ej. Administrador Nova"
                />
              </label>
            )}

            <label>
              Correo
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                placeholder="admin@novasalud.pe"
              />
            </label>

            <label>
              Contraseña
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                placeholder="Minimo 6 caracteres"
              />
            </label>

            {authError && <div className="message error">{authError}</div>}

            <button className="primary-action" type="submit" disabled={authLoading}>
              {authLoading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
              {authMode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>

            <button
              className="text-action"
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setAuthError('');
              }}
            >
              {authMode === 'login'
                ? 'Necesito crear el primer administrador'
                : 'Ya tengo una cuenta'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={28} />
          <div>
            <strong>Nova Salud</strong>
            <span>Botica conectada</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeView === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <button className="logout-button" onClick={logout} type="button">
          <LogOut size={18} />
          Cerrar sesion
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Sesion {user.rol}</span>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={loadWorkspace} type="button">
              <RefreshCw size={18} />
              Recargar
            </button>
            <div className="user-chip">
              <Users size={17} />
              <span>{user.nombre}</span>
            </div>
          </div>
        </header>

        {notice && (
          <div className="message success">
            <CheckCircle2 size={18} />
            {notice}
          </div>
        )}
        {error && <div className="message error">{error}</div>}
        {loadingData && <div className="message neutral">Actualizando datos...</div>}

        {activeView === 'dashboard' && (
          <Dashboard
            dashboard={dashboard}
            alerts={alerts}
            sales={sales}
            setActiveView={setActiveView}
          />
        )}

        {activeView === 'inventory' && (
          <Inventory
            user={user}
            products={products}
            productForm={productForm}
            setProductForm={setProductForm}
            productSearch={productSearch}
            setProductSearch={setProductSearch}
            editingProductId={editingProductId}
            setEditingProductId={setEditingProductId}
            savingProduct={savingProduct}
            handleProductSubmit={handleProductSubmit}
            editProduct={editProduct}
            deleteProduct={deleteProduct}
            resetProductForm={() => {
              setProductForm(emptyProduct);
              setEditingProductId(null);
            }}
          />
        )}

        {activeView === 'sales' && (
          <Sales
            products={filteredSaleProducts}
            saleSearch={saleSearch}
            setSaleSearch={setSaleSearch}
            saleForm={saleForm}
            setSaleForm={setSaleForm}
            cart={cart}
            cartTotal={cartTotal}
            addToCart={addToCart}
            updateCartQuantity={updateCartQuantity}
            removeFromCart={removeFromCart}
            submitSale={submitSale}
            savingSale={savingSale}
            sales={sales}
          />
        )}

        {activeView === 'alerts' && (
          <Alerts alerts={alerts} setActiveView={setActiveView} user={user} />
        )}

        {activeView === 'users' && user.rol === 'admin' && (
          <UsersPanel
            users={users}
            userForm={userForm}
            setUserForm={setUserForm}
            submitUser={submitUser}
            savingUser={savingUser}
          />
        )}
      </main>
    </div>
  );
}

function viewTitle(view) {
  const titles = {
    dashboard: 'Panel operativo',
    inventory: 'Inventario centralizado',
    sales: 'Atencion y ventas',
    alerts: 'Reposicion de stock',
    users: 'Usuarios y acceso',
  };
  return titles[view] || 'Nova Salud';
}

function Dashboard({ dashboard, alerts, sales, setActiveView }) {
  const metrics = [
    {
      label: 'Productos activos',
      value: dashboard?.productos_activos ?? 0,
      icon: Boxes,
      tone: 'green',
    },
    {
      label: 'Alertas de stock',
      value: dashboard?.alertas_stock ?? 0,
      icon: AlertTriangle,
      tone: 'amber',
    },
    {
      label: 'Ventas de hoy',
      value: dashboard?.ventas_hoy ?? 0,
      icon: ShoppingCart,
      tone: 'coral',
    },
    {
      label: 'Ingreso de hoy',
      value: money(dashboard?.total_hoy ?? 0),
      icon: BarChart3,
      tone: 'blue',
    },
  ];

  return (
    <section className="dashboard-grid">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article className={`metric-card ${metric.tone}`} key={metric.label}>
            <Icon size={22} />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        );
      })}

      <section className="panel span-2">
        <div className="section-head">
          <div>
            <span className="eyebrow">Atencion rapida</span>
            <h2>Flujo diario</h2>
          </div>
        </div>
        <div className="quick-actions">
          <button onClick={() => setActiveView('sales')} type="button">
            <ShoppingCart size={18} />
            Registrar venta
          </button>
          <button onClick={() => setActiveView('inventory')} type="button">
            <PackagePlus size={18} />
            Gestionar productos
          </button>
          <button onClick={() => setActiveView('alerts')} type="button">
            <AlertTriangle size={18} />
            Revisar alertas
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Bajo stock</span>
            <h2>Reposicion prioritaria</h2>
          </div>
        </div>
        <div className="compact-list">
          {alerts.slice(0, 5).map((item) => (
            <div className="compact-row" key={item.id}>
              <span>{item.nombre}</span>
              <strong>{item.stock_actual} und.</strong>
            </div>
          ))}
          {alerts.length === 0 && <p className="empty">No hay productos por reponer.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Ultimas ventas</span>
            <h2>Historial reciente</h2>
          </div>
        </div>
        <div className="compact-list">
          {sales.slice(0, 5).map((sale) => (
            <div className="compact-row" key={sale.id}>
              <span>Venta #{sale.id}</span>
              <strong>{money(sale.total)}</strong>
            </div>
          ))}
          {sales.length === 0 && <p className="empty">Todavia no hay ventas registradas.</p>}
        </div>
      </section>
    </section>
  );
}

function Inventory({
  user,
  products,
  productForm,
  setProductForm,
  productSearch,
  setProductSearch,
  editingProductId,
  savingProduct,
  handleProductSubmit,
  editProduct,
  deleteProduct,
  resetProductForm,
}) {
  return (
    <section className="stack">
      {user.rol === 'admin' && (
        <form className="panel" onSubmit={handleProductSubmit}>
          <div className="section-head">
            <div>
              <span className="eyebrow">Producto</span>
              <h2>{editingProductId ? 'Editar producto' : 'Registrar producto'}</h2>
            </div>
            {editingProductId && (
              <button className="ghost-button" type="button" onClick={resetProductForm}>
                <X size={18} />
                Cancelar
              </button>
            )}
          </div>

          <div className="form-grid">
            <label>
              Codigo
              <input
                value={productForm.codigo}
                onChange={(event) => setProductForm({ ...productForm, codigo: event.target.value })}
                placeholder="MED-001"
              />
            </label>
            <label>
              Nombre
              <input
                value={productForm.nombre}
                onChange={(event) => setProductForm({ ...productForm, nombre: event.target.value })}
                placeholder="Paracetamol 500 mg"
              />
            </label>
            <label>
              Categoria
              <input
                value={productForm.categoria}
                onChange={(event) =>
                  setProductForm({ ...productForm, categoria: event.target.value })
                }
                placeholder="Analgesicos"
              />
            </label>
            <label>
              Precio
              <input
                type="number"
                step="0.01"
                min="0"
                value={productForm.precio}
                onChange={(event) => setProductForm({ ...productForm, precio: event.target.value })}
                placeholder="3.50"
              />
            </label>
            <label>
              Stock actual
              <input
                type="number"
                min="0"
                value={productForm.stock_actual}
                onChange={(event) =>
                  setProductForm({ ...productForm, stock_actual: event.target.value })
                }
                placeholder="40"
              />
            </label>
            <label>
              Stock minimo
              <input
                type="number"
                min="0"
                value={productForm.stock_minimo}
                onChange={(event) =>
                  setProductForm({ ...productForm, stock_minimo: event.target.value })
                }
                placeholder="10"
              />
            </label>
            <label>
              Proveedor
              <input
                value={productForm.proveedor}
                onChange={(event) =>
                  setProductForm({ ...productForm, proveedor: event.target.value })
                }
                placeholder="Distribuidora"
              />
            </label>
            <label>
              Vencimiento
              <input
                type="date"
                value={productForm.fecha_vencimiento}
                onChange={(event) =>
                  setProductForm({ ...productForm, fecha_vencimiento: event.target.value })
                }
              />
            </label>
          </div>

          <button className="primary-action fit" type="submit" disabled={savingProduct}>
            {savingProduct ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            {editingProductId ? 'Actualizar producto' : 'Guardar producto'}
          </button>
        </form>
      )}

      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Stock</span>
            <h2>Productos disponibles</h2>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Buscar por codigo, nombre o proveedor"
            />
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Producto</th>
                <th>Categoria</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Minimo</th>
                <th>Vence</th>
                {user.rol === 'admin' && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className={product.bajo_stock ? 'row-warning' : ''}>
                  <td>{product.codigo}</td>
                  <td>
                    <strong>{product.nombre}</strong>
                    <span>{product.proveedor || 'Sin proveedor'}</span>
                  </td>
                  <td>{product.categoria}</td>
                  <td>{money(product.precio)}</td>
                  <td>{product.stock_actual}</td>
                  <td>{product.stock_minimo}</td>
                  <td>{shortDate(product.fecha_vencimiento)}</td>
                  {user.rol === 'admin' && (
                    <td>
                      <div className="row-actions">
                        <button className="icon-button" type="button" onClick={() => editProduct(product)}>
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => deleteProduct(product.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && <p className="empty">No hay productos registrados.</p>}
        </div>
      </section>
    </section>
  );
}

function Sales({
  products,
  saleSearch,
  setSaleSearch,
  saleForm,
  setSaleForm,
  cart,
  cartTotal,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  submitSale,
  savingSale,
  sales,
}) {
  return (
    <section className="sales-layout">
      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Mostrador</span>
            <h2>Buscar productos</h2>
          </div>
        </div>
        <label className="search-box full">
          <Search size={18} />
          <input
            value={saleSearch}
            onChange={(event) => setSaleSearch(event.target.value)}
            placeholder="Nombre, codigo o categoria"
          />
        </label>

        <div className="product-picker">
          {products.map((product) => (
            <button className="picker-item" type="button" key={product.id} onClick={() => addToCart(product)}>
              <span>
                <strong>{product.nombre}</strong>
                <small>{product.codigo} | Stock {product.stock_actual}</small>
              </span>
              <b>{money(product.precio)}</b>
              <Plus size={17} />
            </button>
          ))}
          {products.length === 0 && <p className="empty">No hay productos con stock para vender.</p>}
        </div>
      </section>

      <form className="panel cart-panel" onSubmit={submitSale}>
        <div className="section-head">
          <div>
            <span className="eyebrow">Venta</span>
            <h2>Carrito</h2>
          </div>
          <strong className="total">{money(cartTotal)}</strong>
        </div>

        <div className="form-grid compact">
          <label>
            Cliente
            <input
              value={saleForm.cliente}
              onChange={(event) => setSaleForm({ ...saleForm, cliente: event.target.value })}
              placeholder="Cliente mostrador"
            />
          </label>
          <label>
            Pago
            <select
              value={saleForm.metodo_pago}
              onChange={(event) => setSaleForm({ ...saleForm, metodo_pago: event.target.value })}
            >
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="cart-list">
          {cart.map((item) => (
            <div className="cart-row" key={item.product_id}>
              <div>
                <strong>{item.nombre}</strong>
                <span>{money(item.precio)} | stock {item.stock_actual}</span>
              </div>
              <input
                type="number"
                min="1"
                max={item.stock_actual}
                value={item.cantidad}
                onChange={(event) => updateCartQuantity(item.product_id, event.target.value)}
              />
              <button className="icon-button danger" type="button" onClick={() => removeFromCart(item.product_id)}>
                <X size={16} />
              </button>
            </div>
          ))}
          {cart.length === 0 && <p className="empty">Agrega productos para registrar la venta.</p>}
        </div>

        <button className="primary-action" type="submit" disabled={savingSale || cart.length === 0}>
          {savingSale ? <Loader2 className="spin" size={18} /> : <ShoppingCart size={18} />}
          Confirmar venta
        </button>
      </form>

      <section className="panel span-sales">
        <div className="section-head">
          <div>
            <span className="eyebrow">Registro</span>
            <h2>Historial de ventas</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Productos</th>
                <th>Pago</th>
                <th>Vendedor</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.id}</td>
                  <td>{sale.cliente}</td>
                  <td>{sale.resumen}</td>
                  <td>{sale.metodo_pago}</td>
                  <td>{sale.vendedor}</td>
                  <td>{money(sale.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sales.length === 0 && <p className="empty">Todavia no hay ventas.</p>}
        </div>
      </section>
    </section>
  );
}

function Alerts({ alerts, setActiveView, user }) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Reposicion</span>
          <h2>Productos con bajo stock</h2>
        </div>
        {user.rol === 'admin' && (
          <button className="ghost-button" type="button" onClick={() => setActiveView('inventory')}>
            <PackagePlus size={18} />
            Ajustar inventario
          </button>
        )}
      </div>

      <div className="alert-grid">
        {alerts.map((product) => (
          <article className="alert-item" key={product.id}>
            <AlertTriangle size={22} />
            <div>
              <strong>{product.nombre}</strong>
              <span>
                {product.codigo} | {product.categoria}
              </span>
            </div>
            <b>
              {product.stock_actual}/{product.stock_minimo}
            </b>
          </article>
        ))}
        {alerts.length === 0 && <p className="empty">El inventario esta por encima de sus minimos.</p>}
      </div>
    </section>
  );
}

function UsersPanel({ users, userForm, setUserForm, submitUser, savingUser }) {
  return (
    <section className="stack">
      <form className="panel" onSubmit={submitUser}>
        <div className="section-head">
          <div>
            <span className="eyebrow">Acceso</span>
            <h2>Crear usuario</h2>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Nombre
            <input
              value={userForm.nombre}
              onChange={(event) => setUserForm({ ...userForm, nombre: event.target.value })}
              placeholder="Nombre completo"
            />
          </label>
          <label>
            Correo
            <input
              type="email"
              value={userForm.email}
              onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
              placeholder="usuario@novasalud.pe"
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
              placeholder="Minimo 6 caracteres"
            />
          </label>
          <label>
            Rol
            <select
              value={userForm.rol}
              onChange={(event) => setUserForm({ ...userForm, rol: event.target.value })}
            >
              <option value="vendedor">Vendedor</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        </div>
        <button className="primary-action fit" type="submit" disabled={savingUser}>
          {savingUser ? <Loader2 className="spin" size={18} /> : <UserPlus size={18} />}
          Crear usuario
        </button>
      </form>

      <section className="panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Equipo</span>
            <h2>Usuarios activos</h2>
          </div>
        </div>
        <div className="user-grid">
          {users.map((item) => (
            <article className="user-card" key={item.id}>
              <Users size={20} />
              <strong>{item.nombre}</strong>
              <span>{item.email}</span>
              <b>{item.rol}</b>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default App;
