"use strict";

/* Threadora Admin Panel. First use the owner sets her own email and
   password, then signs in. The token lives in session storage and is
   sent as a Bearer token on every admin request. */

var TOKEN_KEY = "threadora-admin-token";
var token = null;
try { token = sessionStorage.getItem(TOKEN_KEY); } catch (e) {}
var tab = "orders";
var data = null;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(v) {
  return "PKR " + Number(v).toLocaleString("en-PK");
}

function api(path, options) {
  var headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  var opts = options || {};
  opts.headers = headers;
  return fetch(path, opts).then(function (r) {
    if (!r.ok) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        throw new Error(body.error || "Request failed");
      });
    }
    return r.json();
  });
}

function authForm(isSetup) {
  return '<section class="panel" style="padding:1.5rem 1.25rem;max-width:26rem;margin:0 auto">' +
    '<h2 class="font-display" style="font-size:24px;font-weight:600;margin:0">' +
    (isSetup ? "Set up the Admin Panel" : "Admin sign in") + "</h2>" +
    '<p style="margin:0.5rem 0 0;font-size:14px;line-height:1.6;color:var(--dim)">' +
    (isSetup
      ? "No admin account exists yet. Choose the email and password you will use to sign in."
      : "Sign in with the admin email and password you set up.") + "</p>" +
    '<form id="admin-auth-form" style="margin-top:1.25rem" novalidate>' +
    '<div><label for="admin-email" class="field-label">Email</label>' +
    '<input id="admin-email" type="email" class="field-input" required autocomplete="email" /></div>' +
    '<div style="margin-top:1rem"><label for="admin-password" class="field-label">Password' +
    (isSetup ? " (at least 8 characters)" : "") + "</label>" +
    '<input id="admin-password" type="password" class="field-input" required autocomplete="current-password" /></div>' +
    '<p id="admin-error" class="form-error" role="alert" style="margin:0.75rem 0 0;display:none"></p>' +
    '<button type="submit" class="btn-primary btn-block" style="margin-top:1.25rem">' +
    (isSetup ? "Create admin account" : "Sign in") + "</button></form></section>";
}

function dashboard() {
  var stats = data.stats;
  var tabs = '<div class="admin-tabs" role="tablist">' +
    '<button type="button" class="admin-tab' + (tab === "orders" ? " active" : "") + '" data-tab="orders">Orders (' + stats.orders + ")</button>" +
    '<button type="button" class="admin-tab' + (tab === "messages" ? " active" : "") + '" data-tab="messages">Messages (' + stats.messages + ")</button>" +
    '<button type="button" class="admin-tab' + (tab === "subscribers" ? " active" : "") + '" data-tab="subscribers">Subscribers (' + stats.subscribers + ")</button></div>";
  var body = "";
  if (tab === "orders") {
    if (data.orders.length === 0) {
      body = '<p style="margin-top:1.5rem;font-size:15px;color:var(--dim)">No orders yet.</p>';
    } else {
      body = '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>' +
        data.orders.map(function (o) {
          var items = o.items.map(function (it) {
            return esc(it.product_name) + " (" + esc(it.size) + ", " + it.qty + ")";
          }).join("<br />");
          var options = ["New", "Confirmed", "Dispatched", "Delivered", "Cancelled"].map(function (s) {
            return '<option value="' + s + '"' + (o.status === s ? " selected" : "") + ">" + s + "</option>";
          }).join("");
          return "<tr><td><strong>" + esc(o.order_number) + "</strong><br /><span style=\"color:var(--dim)\">" +
            esc(new Date(o.created_at).toLocaleDateString("en-PK")) + "</span></td><td>" +
            esc(o.customer_name) + "<br /><span style=\"color:var(--dim)\">" + esc(o.phone) + ", " + esc(o.city) + "</span></td><td>" +
            items + "</td><td>" + money(o.total) + '</td><td><select class="field-input" data-order-status="' + o.id + '" aria-label="Status for ' + esc(o.order_number) + '">' + options + "</select></td></tr>";
        }).join("") + "</tbody></table></div>";
    }
  } else if (tab === "messages") {
    if (data.messages.length === 0) {
      body = '<p style="margin-top:1.5rem;font-size:15px;color:var(--dim)">No messages yet.</p>';
    } else {
      body = '<div class="table-wrap"><table class="admin-table"><thead><tr><th>From</th><th>Subject</th><th>Message</th><th>Status</th></tr></thead><tbody>' +
        data.messages.map(function (m) {
          var options = ["New", "Read", "Replied"].map(function (s) {
            return '<option value="' + s + '"' + (m.status === s ? " selected" : "") + ">" + s + "</option>";
          }).join("");
          return "<tr><td>" + esc(m.name) + "</td><td>" + esc(m.subject) + "</td><td>" + esc(m.message) + '</td><td><select class="field-input" data-message-status="' + m.id + '" aria-label="Status for message from ' + esc(m.name) + '">' + options + "</select></td></tr>";
        }).join("") + "</tbody></table></div>";
    }
  } else {
    if (data.subscribers.length === 0) {
      body = '<p style="margin-top:1.5rem;font-size:15px;color:var(--dim)">No subscribers yet.</p>';
    } else {
      body = '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Email</th><th>Joined</th></tr></thead><tbody>' +
        data.subscribers.map(function (s) {
          return "<tr><td>" + esc(s.email) + "</td><td>" + esc(new Date(s.created_at).toLocaleDateString("en-PK")) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
  }
  return '<section class="stat-grid">' +
    '<div class="panel stat-card"><p class="num">' + stats.orders + '</p><p class="lbl">Orders</p></div>' +
    '<div class="panel stat-card"><p class="num">' + money(stats.revenue) + '</p><p class="lbl">Revenue</p></div>' +
    '<div class="panel stat-card"><p class="num">' + stats.messages + '</p><p class="lbl">Messages</p></div>' +
    '<div class="panel stat-card"><p class="num">' + stats.subscribers + '</p><p class="lbl">Subscribers</p></div>' +
    "</section>" + tabs + body;
}

function render() {
  var root = document.getElementById("admin-root");
  var signOut = document.getElementById("sign-out-btn");
  if (data) {
    signOut.style.display = "";
    root.innerHTML = dashboard();
  } else {
    signOut.style.display = "none";
    root.innerHTML = '<p style="text-align:center;color:var(--dim)">Loading the Admin Panel.</p>';
  }
  wire();
}

function wire() {
  var form = document.getElementById("admin-auth-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("admin-email").value.trim();
      var password = document.getElementById("admin-password").value;
      var err = document.getElementById("admin-error");
      var isSetup = form.dataset.setup === "1";
      var path = isSetup ? "/api/admin/setup" : "/api/admin/signin";
      api(path, { method: "POST", body: JSON.stringify({ email: email, password: password }) })
        .then(function (res) {
          token = res.token;
          try { sessionStorage.setItem(TOKEN_KEY, token); } catch (e2) {}
          loadData();
        })
        .catch(function (e2) {
          err.textContent = e2.message;
          err.style.display = "block";
        });
    });
  }
  document.querySelectorAll("[data-tab]").forEach(function (el) {
    el.addEventListener("click", function () { tab = el.getAttribute("data-tab"); render(); });
  });
  document.querySelectorAll("[data-order-status]").forEach(function (el) {
    el.addEventListener("change", function () {
      api("/api/admin/orders/" + el.getAttribute("data-order-status"), {
        method: "PATCH",
        body: JSON.stringify({ status: el.value }),
      }).then(loadData).catch(function () { loadData(); });
    });
  });
  document.querySelectorAll("[data-message-status]").forEach(function (el) {
    el.addEventListener("change", function () {
      api("/api/admin/messages/" + el.getAttribute("data-message-status"), {
        method: "PATCH",
        body: JSON.stringify({ status: el.value }),
      }).then(loadData).catch(function () { loadData(); });
    });
  });
}

function loadData() {
  api("/api/admin/data")
    .then(function (res) { data = res; render(); })
    .catch(function () {
      token = null;
      try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
      showAuth();
    });
}

function showAuth() {
  var root = document.getElementById("admin-root");
  document.getElementById("sign-out-btn").style.display = "none";
  fetch("/api/admin/status")
    .then(function (r) { return r.json(); })
    .then(function (status) {
      root.innerHTML = authForm(!status.hasAdmin);
      var form = document.getElementById("admin-auth-form");
      if (form) form.dataset.setup = status.hasAdmin ? "0" : "1";
      wire();
    })
    .catch(function () {
      root.innerHTML = '<p style="text-align:center;color:var(--dim)">The Admin Panel could not be loaded. Please refresh the page.</p>';
    });
}

document.getElementById("sign-out-btn").addEventListener("click", function () {
  api("/api/admin/signout", { method: "POST", body: "{}" }).catch(function () {});
  token = null;
  data = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
  showAuth();
});

if (token) {
  loadData();
} else {
  showAuth();
}
