"use strict";

/* MySQL access for Threadora. Credentials come only from environment
   variables, never from code. On Hostinger these are set in the Node Web
   App settings. Locally they come from a .env file or the shell. */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function config() {
  const dbName = env("DB_NAME", "");
  if (!dbName) {
    throw new Error(
      "DB_NAME is not set. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME before starting."
    );
  }
  return {
    host: env("DB_HOST", "127.0.0.1"),
    port: Number(env("DB_PORT", "3306")),
    user: env("DB_USER", ""),
    password: env("DB_PASSWORD", ""),
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

let pool = null;

function getPool() {
  if (!pool) pool = mysql.createPool(config());
  return pool;
}

async function query(sql, params) {
  const rows = await getPool().execute(sql, params || []);
  return rows[0];
}

/* Create the tables if they do not exist, then seed the 12 products from
   db/seed-products.json when the products table is empty. Production
   starts empty for orders, subscribers, messages and admins. */
async function initDb() {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await getPool().query(statement);
  }
  /* Tables created before the colours range existed have no colors
     column. Add it only when it is missing, so a fresh database gets it
     from schema.sql and an existing one is migrated in place. */
  const cols = await query("SHOW COLUMNS FROM products LIKE 'colors'");
  if (cols.length === 0) {
    await getPool().query("ALTER TABLE products ADD COLUMN colors JSON NOT NULL AFTER color");
  }
  const seedPath = path.join(__dirname, "..", "db", "seed-products.json");
  const seedProducts = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const count = await query("SELECT COUNT(*) AS n FROM products");
  if (count[0].n === 0) {
    for (let i = 0; i < seedProducts.length; i++) {
      const p = seedProducts[i];
      await query(
        "INSERT INTO products (id, name, category, price, color, colors, sizes, fabric, description, details, image, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          p.id,
          p.name,
          p.category,
          p.price,
          p.color,
          JSON.stringify(p.colors && p.colors.length ? p.colors : [p.color]),
          JSON.stringify(p.sizes),
          p.fabric,
          p.description,
          JSON.stringify(p.details),
          p.image,
          i + 1,
        ]
      );
    }
  }
  /* Align the colours range on existing rows with the seed file. Only
     the colors column is ever touched here, never name, price, photo,
     sizes or any other field. */
  for (const p of seedProducts) {
    await query("UPDATE products SET colors = ? WHERE id = ?", [
      JSON.stringify(p.colors && p.colors.length ? p.colors : [p.color]),
      p.id,
    ]);
  }
}

/* mysql2 already parses JSON columns into values, while a stored JSON
   string would need parsing. Accept both so the code works either way. */
function asArray(value) {
  return Array.isArray(value) ? value : JSON.parse(value);
}

function rowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    color: row.color,
    colors: row.colors == null ? [row.color] : asArray(row.colors),
    sizes: asArray(row.sizes),
    fabric: row.fabric,
    description: row.description,
    details: asArray(row.details),
    img: row.image,
  };
}

async function getProducts() {
  const rows = await query("SELECT * FROM products ORDER BY sort_order ASC");
  return rows.map(rowToProduct);
}

async function getProduct(id) {
  const rows = await query("SELECT * FROM products WHERE id = ?", [id]);
  return rows.length ? rowToProduct(rows[0]) : null;
}

/* Place an order. Prices and sizes are always read from the database,
   never trusted from the request, so a changed price in the browser
   cannot change what is charged. Order numbers are TH-1001, TH-1002
   and so on, from the row id. */
async function placeOrder(customer, items) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    const lines = [];
    for (const item of items) {
      const rows = await conn.execute("SELECT * FROM products WHERE id = ?", [
        item.productId,
      ]);
      const product = rows[0][0];
      if (!product) throw new Error("Unknown product: " + item.productId);
      const sizes = asArray(product.sizes);
      if (sizes.indexOf(item.size) === -1) {
        throw new Error("Size not available for " + product.name);
      }
      const qty = Math.floor(Number(item.qty));
      if (!qty || qty < 1 || qty > 9) throw new Error("Bad quantity");
      total += product.price * qty;
      lines.push({
        productId: product.id,
        productName: product.name,
        size: item.size,
        qty,
        unitPrice: product.price,
      });
    }
    const inserted = await conn.execute(
      "INSERT INTO orders (customer_name, phone, address, city, notes, total, status) VALUES (?, ?, ?, ?, ?, ?, 'New')",
      [
        customer.customerName,
        customer.phone,
        customer.address,
        customer.city,
        customer.notes || "",
        total,
      ]
    );
    const orderId = inserted[0].insertId;
    const orderNumber = "TH-" + (1000 + orderId);
    await conn.execute("UPDATE orders SET order_number = ? WHERE id = ?", [
      orderNumber,
      orderId,
    ]);
    for (const line of lines) {
      await conn.execute(
        "INSERT INTO order_items (order_id, product_id, product_name, size, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?)",
        [
          orderId,
          line.productId,
          line.productName,
          line.size,
          line.qty,
          line.unitPrice,
        ]
      );
    }
    await conn.commit();
    return { orderNumber, total };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function subscribe(email) {
  try {
    await query("INSERT INTO subscribers (email) VALUES (?)", [email]);
    return { subscribed: true, already: false };
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return { subscribed: true, already: true };
    }
    throw err;
  }
}

async function saveMessage(name, subject, message) {
  await query(
    "INSERT INTO messages (name, subject, message, status) VALUES (?, ?, ?, 'New')",
    [name, subject, message]
  );
  return { saved: true };
}

async function getAdminData() {
  const statsRows = await query(
    "SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM messages) AS messages, (SELECT COUNT(*) FROM subscribers) AS subscribers, (SELECT COALESCE(SUM(total), 0) FROM orders) AS revenue"
  );
  const orders = await query(
    "SELECT id, order_number, customer_name, phone, address, city, notes, total, status, created_at FROM orders ORDER BY id DESC"
  );
  for (const order of orders) {
    order.items = await query(
      "SELECT product_id, product_name, size, qty, unit_price FROM order_items WHERE order_id = ?",
      [order.id]
    );
  }
  const messages = await query(
    "SELECT id, name, subject, message, status, created_at FROM messages ORDER BY id DESC"
  );
  const subscribers = await query(
    "SELECT id, email, created_at FROM subscribers ORDER BY id DESC"
  );
  return {
    stats: {
      orders: statsRows[0].orders,
      messages: statsRows[0].messages,
      subscribers: statsRows[0].subscribers,
      revenue: statsRows[0].revenue,
    },
    orders,
    messages,
    subscribers,
  };
}

async function setOrderStatus(id, status) {
  const allowed = ["New", "Confirmed", "Dispatched", "Delivered", "Cancelled"];
  if (allowed.indexOf(status) === -1) throw new Error("Bad order status");
  await query("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
}

async function setMessageStatus(id, status) {
  const allowed = ["New", "Read", "Replied"];
  if (allowed.indexOf(status) === -1) throw new Error("Bad message status");
  await query("UPDATE messages SET status = ? WHERE id = ?", [status, id]);
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  config,
  query,
  initDb,
  getProducts,
  getProduct,
  placeOrder,
  subscribe,
  saveMessage,
  getAdminData,
  setOrderStatus,
  setMessageStatus,
  close,
};
