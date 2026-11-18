"use strict";

/* Threadora backend. Express serves the shop frontend from public/ and
   provides the JSON API the shop and the Admin Panel use. The same app
   serves the pages and the API, so a Hostinger Node Web App runs it as
   one process. Entry file: server.js. Start: node server.js. */

require("dotenv").config();

const path = require("path");
const express = require("express");
const db = require("./src/db");
const auth = require("./src/auth");

const app = express();
const PORT = Number(process.env.PORT || "3000");

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

function isEmail(value) {
  return typeof value === "string" && value.indexOf("@") > 0 && value.indexOf(".") > value.indexOf("@");
}

function sendError(res, err) {
  if (err && err.status) return res.status(err.status).json({ error: err.message });
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "threadora-backend" });
});

app.get("/api/products", async (req, res) => {
  try {
    res.json(await db.getProducts());
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body || {};
    const customerName = String(body.customerName || "").trim();
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "").trim();
    const city = String(body.city || "").trim();
    const notes = String(body.notes || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];
    if (customerName.length < 2) return res.status(400).json({ error: "Please enter your name." });
    if (phone.length < 7) return res.status(400).json({ error: "Please enter a phone number." });
    if (address.length < 5) return res.status(400).json({ error: "Please enter an address." });
    if (city.length < 2) return res.status(400).json({ error: "Please enter a city." });
    if (items.length === 0) return res.status(400).json({ error: "Your bag is empty." });
    const saved = await db.placeOrder(
      { customerName, phone, address, city, notes },
      items
    );
    res.status(201).json(saved);
  } catch (err) {
    if (err && /Unknown product|Size not available|Bad quantity/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    sendError(res, err);
  }
});

app.post("/api/newsletter", async (req, res) => {
  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    res.json(await db.subscribe(email));
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/contact", async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
    if (subject.length < 2) return res.status(400).json({ error: "Please enter a subject." });
    if (message.length < 5) return res.status(400).json({ error: "Please write a short message." });
    res.status(201).json(await db.saveMessage(name, subject, message));
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/admin/status", async (req, res) => {
  try {
    res.json({ hasAdmin: await auth.hasAdmin() });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/admin/setup", async (req, res) => {
  try {
    const body = req.body || {};
    const token = await auth.setupAdmin(
      String(body.email || "").trim().toLowerCase(),
      String(body.password || "")
    );
    res.status(201).json({ token });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/admin/signin", async (req, res) => {
  try {
    const body = req.body || {};
    const token = await auth.signIn(
      String(body.email || "").trim().toLowerCase(),
      String(body.password || "")
    );
    res.json({ token });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/admin/signout", auth.requireAdmin, async (req, res) => {
  try {
    const header = req.headers.authorization || "";
    await auth.signOut(header.slice(7));
    res.json({ signedOut: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/admin/data", auth.requireAdmin, async (req, res) => {
  try {
    res.json(await db.getAdminData());
  } catch (err) {
    sendError(res, err);
  }
});

app.patch("/api/admin/orders/:id", auth.requireAdmin, async (req, res) => {
  try {
    await db.setOrderStatus(Number(req.params.id), String((req.body || {}).status || ""));
    res.json({ updated: true });
  } catch (err) {
    if (err && /Bad order status/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    sendError(res, err);
  }
});

app.patch("/api/admin/messages/:id", auth.requireAdmin, async (req, res) => {
  try {
    await db.setMessageStatus(Number(req.params.id), String((req.body || {}).status || ""));
    res.json({ updated: true });
  } catch (err) {
    if (err && /Bad message status/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    sendError(res, err);
  }
});

/* Shop routes are rendered by the single page app, so any other page
   request serves the shop. API routes above are matched first. */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await db.initDb();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log("Threadora backend listening on port " + PORT);
  });
}

if (require.main === module) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Threadora backend could not start:", err.message);
    process.exit(1);
  });
}

module.exports = app;
