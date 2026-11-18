"use strict";

/* Admin accounts for Threadora. Passwords are salted with scrypt, never
   stored in plain text. Sessions are random 32 byte tokens that live for
   30 days, stored in the database so signing out really ends them. */

const crypto = require("crypto");
const db = require("./db");

const SESSION_DAYS = 30;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

async function hasAdmin() {
  const rows = await db.query("SELECT COUNT(*) AS n FROM admins");
  return rows[0].n > 0;
}

async function createSession(adminId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    "INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, ?)",
    [token, adminId, expires]
  );
  return token;
}

async function setupAdmin(email, password) {
  if (await hasAdmin()) {
    const err = new Error("An admin account already exists");
    err.status = 409;
    throw err;
  }
  if (!email || email.indexOf("@") === -1) {
    const err = new Error("Enter a valid email address");
    err.status = 400;
    throw err;
  }
  if (!password || password.length < 8) {
    const err = new Error("Password must be at least 8 characters");
    err.status = 400;
    throw err;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const inserted = await db.query(
    "INSERT INTO admins (email, password_hash, salt) VALUES (?, ?, ?)",
    [email, hash, salt]
  );
  return createSession(inserted.insertId);
}

async function signIn(email, password) {
  const rows = await db.query("SELECT * FROM admins WHERE email = ?", [email]);
  const admin = rows[0];
  if (!admin) {
    const err = new Error("Wrong email or password");
    err.status = 401;
    throw err;
  }
  const hash = hashPassword(password, admin.salt);
  const ok =
    hash.length === admin.password_hash.length &&
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(admin.password_hash));
  if (!ok) {
    const err = new Error("Wrong email or password");
    err.status = 401;
    throw err;
  }
  return createSession(admin.id);
}

async function signOut(token) {
  await db.query("DELETE FROM sessions WHERE token = ?", [token]);
}

async function adminFromToken(token) {
  if (!token) return null;
  const rows = await db.query(
    "SELECT a.id, a.email FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token = ? AND s.expires_at > NOW()",
    [token]
  );
  return rows[0] || null;
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.indexOf("Bearer ") === 0 ? header.slice(7) : "";
  adminFromToken(token)
    .then((admin) => {
      if (!admin) return res.status(401).json({ error: "Sign in required" });
      req.admin = admin;
      next();
    })
    .catch(next);
}

module.exports = { hasAdmin, setupAdmin, signIn, signOut, requireAdmin };
