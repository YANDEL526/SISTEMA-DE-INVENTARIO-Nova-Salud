# Nova Salud - Sistema Web para Botica

Nova Salud es un software web diseñado para ayudar a una botica a controlar su inventario, registrar ventas, detectar productos con bajo stock y gestionar el acceso de usuarios de forma segura.

## ¿Para qué sirve?

El sistema permite centralizar las operaciones principales de la botica:

- Controlar productos y stock disponible.
- Registrar ventas de forma rápida.
- Descontar automáticamente el stock después de cada venta.
- Ver alertas de productos que necesitan reposición.
- Consultar ventas recientes.
- Gestionar usuarios con roles de acceso.
- Proteger el sistema con login, contraseñas encriptadas y tokens JWT.

## Módulos del sistema

### 1. Inicio de sesión

Para ingresar al sistema, el usuario debe iniciar sesión con correo y contraseña.

La primera cuenta que se registre será creada como administrador. Después, el administrador podrá crear usuarios vendedores desde el módulo de usuarios.

### 2. Dashboard

El panel principal muestra un resumen rápido de la botica:

- Productos activos.
- Alertas de bajo stock.
- Ventas del día.
- Ingresos del día.
- Últimas ventas registradas.
- Productos que necesitan reposición.

Este módulo ayuda a tomar decisiones rápidas sobre inventario y ventas.

### 3. Inventario

En este módulo se registran y administran los productos de la botica.

Cada producto puede tener:

- Código.
- Nombre.
- Categoría.
- Precio.
- Stock actual.
- Stock mínimo.
- Proveedor.
- Fecha de vencimiento.

El administrador puede crear, editar o desactivar productos. El vendedor puede consultar los productos disponibles.

### 4. Ventas

El módulo de ventas permite atender al cliente de forma rápida.

El usuario puede:

- Buscar productos por nombre, código o categoría.
- Agregar productos al carrito.
- Indicar cantidades.
- Seleccionar método de pago.
- Registrar la venta.

Cuando se confirma una venta, el sistema descuenta automáticamente el stock y guarda el historial.

### 5. Alertas

El sistema muestra una alerta cuando un producto tiene stock bajo.

Esto ocurre cuando:

```text
stock actual <= stock mínimo
```

Este módulo ayuda a evitar desabastecimientos y permite planificar la reposición de productos.

### 6. Usuarios

Este módulo solo está disponible para administradores.

Permite crear usuarios con dos tipos de rol:

- `admin`: puede gestionar productos y usuarios.
- `vendedor`: puede registrar ventas y consultar inventario.

## Seguridad del sistema

Nova Salud incluye medidas de seguridad para proteger la información:

- Inicio de sesión obligatorio.
- Contraseñas encriptadas con bcrypt.
- Tokens JWT para validar sesiones.
- Middleware de autenticación.
- Roles de usuario.
- Protección de rutas privadas.
- Restricción de acceso según permisos.

## Requisitos para ejecutar el sistema

Antes de iniciar el sistema, debes tener instalado:

- Node.js.
- npm.
- MySQL Server.
- Visual Studio Code, recomendado.
- MySQL Workbench, opcional para revisar la base de datos.

## Configuración de la base de datos

El archivo de configuración está en:

```text
backend/.env
```

Ejemplo:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=admin123
DB_NAME=nova_salud_db
DB_PORT=3306
PORT=3001
JWT_SECRET=nova_salud_dev_secret_change_me
JWT_EXPIRES_IN=2h
CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

Si tu contraseña de MySQL es diferente, debes cambiar `DB_PASSWORD`.

## ¿La base de datos se crea automáticamente?

Sí. Al ejecutar el backend, el sistema intenta crear automáticamente:

- Base de datos `nova_salud_db`.
- Tabla `users`.
- Tabla `products`.
- Tabla `sales`.
- Tabla `sale_items`.
- Tabla `stock_movements`.

No es obligatorio crear la base manualmente en MySQL Workbench. Solo debes asegurarte de que MySQL Server esté encendido y que los datos del archivo `.env` sean correctos.

El archivo `backend/sql/schema.sql` también está disponible como respaldo si deseas crear las tablas manualmente.

## Cómo ejecutar el proyecto

Primera vez:

```bash
npm install
cd backend
npm install
cd ..
npm run dev
```

Después de instalar las dependencias, para volver a ejecutar el sistema solo usa:

```bash
npm run dev
```

Normalmente el sistema se abrirá en:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:3001
```

## Uso recomendado

1. Iniciar MySQL Server.
2. Ejecutar el proyecto con `npm run dev`.
3. Crear la primera cuenta de administrador.
4. Registrar productos en inventario.
5. Definir stock mínimo para cada producto.
6. Registrar ventas desde el módulo de ventas.
7. Revisar alertas de bajo stock.
8. Crear usuarios vendedores si es necesario.

## Beneficios para la botica

- Reduce errores en el inventario.
- Mejora el tiempo de atención al cliente.
- Evita vender productos sin stock.
- Ayuda a detectar productos que necesitan reposición.
- Organiza las ventas y movimientos de stock.
- Mejora la seguridad de la información.
- Facilita la administración diaria de la botica.

