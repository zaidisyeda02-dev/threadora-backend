"use strict";

/* End to end check for the Threadora backend rebuild. Run the server
   first (node server.js), then run: node scripts/verify.js
   It uses only the public API and pages, the same way a visitor and
   the owner would. It exits non-zero if any check fails. */

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";

let failures = 0;
let checks = 0;

function check(name, ok, detail) {
  checks++;
  if (ok) {
    console.log("PASS  " + name);
  } else {
    failures++;
    console.log("FAIL  " + name + (detail ? "  " + detail : ""));
  }
}

async function req(path, options) {
  const res = await fetch(BASE + path, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, text, json };
}

async function main() {
  const health = await req("/api/health");
  check("health endpoint", health.status === 200 && health.json && health.json.ok);

  for (const page of ["/", "/shop", "/about", "/contact", "/cart", "/checkout"]) {
    const r = await req(page);
    check("page loads " + page, r.status === 200 && r.text.indexOf('<div id="app">') !== -1 && r.text.indexOf('<script src="/app.js">') !== -1, "status " + r.status);
  }

  const products = await req("/api/products");
  check("products endpoint returns 12", products.status === 200 && Array.isArray(products.json) && products.json.length === 12, products.status + " count " + (products.json && products.json.length));
  const byId = {};
  if (Array.isArray(products.json)) {
    for (const p of products.json) byId[p.id] = p;
  }
  check("Champagne Satin Slip Dress PKR 15,400", byId["champagne-satin-slip-dress"] && byId["champagne-satin-slip-dress"].price === 15400);
  check("Ivory Linen Shirt Set PKR 7,600", byId["ivory-linen-shirt-set"] && byId["ivory-linen-shirt-set"].price === 7600);
  check("4 dresses, 4 kurtis, 4 casual wear",
    Array.isArray(products.json) &&
    products.json.filter((p) => p.category === "Dresses").length === 4 &&
    products.json.filter((p) => p.category === "Kurtis").length === 4 &&
    products.json.filter((p) => p.category === "Casual Wear").length === 4);
  check("every product has image, sizes and details",
    Array.isArray(products.json) && products.json.every((p) => p.img && p.img.indexOf("/images/") === 0 && p.sizes.length > 0 && p.details.length > 0));

  const detail = await req("/api/products/champagne-satin-slip-dress");
  check("product detail endpoint", detail.status === 200 && detail.json && detail.json.name === "Champagne Satin Slip Dress");
  check("detail page route loads", (await req("/product/champagne-satin-slip-dress")).status === 200);

  for (const img of ["/images/hero.jpg", "/images/champagne-satin-slip-dress.jpg", "/images/ivory-linen-shirt-set.webp"]) {
    const r = await req(img);
    check("image serves " + img, r.status === 200 && r.text.length > 1000);
  }

  const order = await req("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Verify Test",
      phone: "03001234567",
      address: "1 Test Street",
      city: "Karachi",
      notes: "verify run",
      items: [
        { productId: "champagne-satin-slip-dress", size: "M", qty: 1 },
        { productId: "blush-embroidered-kurti", size: "S", qty: 2 },
      ],
    }),
  });
  check("checkout saves an order", order.status === 201 && order.json && /^TH-\d+$/.test(order.json.orderNumber), order.status + " " + order.text.slice(0, 120));
  check("order total is 15400 + 2 x 6850 = 29100", order.json && order.json.total === 29100, "got " + (order.json && order.json.total));

  const badOrder = await req("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Verify Test",
      phone: "03001234567",
      address: "1 Test Street",
      city: "Karachi",
      total: 1,
      items: [{ productId: "champagne-satin-slip-dress", size: "M", qty: 1 }],
    }),
  });
  check("order total is not trusted from the client (server prices only)", badOrder.status === 201 && badOrder.json && badOrder.json.total === 15400, "got " + (badOrder.json && badOrder.json.total));

  const badSize = await req("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerName: "Verify Test",
      phone: "03001234567",
      address: "1 Test Street",
      city: "Karachi",
      items: [{ productId: "champagne-satin-slip-dress", size: "XXL", qty: 1 }],
    }),
  });
  check("invalid size is rejected", badSize.status === 400);

  const news = await req("/api/newsletter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "verify-" + Date.now() + "@example.com" }),
  });
  check("newsletter saves", news.status === 200 && news.json && news.json.subscribed);

  const contact = await req("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Verify Test", subject: "Verify", message: "This is a verification message." }),
  });
  check("contact message saves", contact.status === 201 && contact.json && contact.json.saved);

  const status = await req("/api/admin/status");
  check("admin status endpoint", status.status === 200 && typeof status.json.hasAdmin === "boolean", JSON.stringify(status.json));

  const email = "admin-" + Date.now() + "@example.com";
  let token = null;
  if (status.json && !status.json.hasAdmin) {
    const setup = await req("/api/admin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "verify-pass-123" }),
    });
    check("admin first use setup", setup.status === 201 && setup.json && setup.json.token, setup.status + " " + setup.text.slice(0, 120));
    token = setup.json && setup.json.token;
    const second = await req("/api/admin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "verify-pass-123" }),
    });
    check("second admin setup is refused", second.status === 409);
  } else {
    console.log("NOTE  admin already exists in this database, setup checks skipped");
  }

  const wrong = await req("/api/admin/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  if (token) check("wrong admin password is rejected", wrong.status === 401);

  if (token) {
    const ok = await req("/api/admin/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "verify-pass-123" }),
    });
    check("correct admin password signs in", ok.status === 200 && ok.json && ok.json.token);
    token = ok.json.token;
  }

  const noAuth = await req("/api/admin/data");
  check("admin data without a token is refused", noAuth.status === 401);

  if (token) {
    const data = await req("/api/admin/data", {
      headers: { Authorization: "Bearer " + token },
    });
    check("admin data loads", data.status === 200 && data.json && data.json.stats, data.status);
    check("admin stats count the saved order, message and subscriber",
      data.json && data.json.stats.orders >= 1 && data.json.stats.messages >= 1 && data.json.stats.subscribers >= 1,
      JSON.stringify(data.json && data.json.stats));
    const firstOrder = data.json && data.json.orders && data.json.orders[0];
    if (firstOrder) {
      const patch = await req("/api/admin/orders/" + firstOrder.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ status: "Confirmed" }),
      });
      check("order status change saves", patch.status === 200);
      const again = await req("/api/admin/data", {
        headers: { Authorization: "Bearer " + token },
      });
      const same = again.json.orders.find((o) => o.id === firstOrder.id);
      check("order status change persists", same && same.status === "Confirmed");
    }
    const firstMessage = data.json && data.json.messages && data.json.messages[0];
    if (firstMessage) {
      const patch = await req("/api/admin/messages/" + firstMessage.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ status: "Read" }),
      });
      check("message status change saves", patch.status === 200);
    }
  }

  console.log("\n" + checks + " checks, " + failures + " failed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("Verify run failed:", err.message);
  process.exit(1);
});
