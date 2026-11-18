      "use strict";

      /* Catalog, copied verbatim from the canonical Threadora build. */
      var PRODUCTS = [];
      /* Images are files served by the app, not embedded data. */
      var IMAGES = { hero: "/images/hero.jpg", silkRose: "/images/silk-rose.jpg", silkBlush: "/images/silk-blush.webp", boutique: "/images/boutique.png" };
      var CATEGORIES = ["Dresses", "Kurtis", "Casual Wear"];

      function byId(id) { for (var i = 0; i < PRODUCTS.length; i++) { if (PRODUCTS[i].id === id) return PRODUCTS[i]; } return null; }
      function formatPrice(v) { return "PKR " + v.toLocaleString("en-PK"); }
      function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
      /* Colour ranges, exactly as on the live site: each product is made
         in the colours listed here, with the photo colour first. */
      var COLOR_SWATCHES = {
        "Blush Pink": "#e6b8bf", "Champagne": "#d3b578", "Dusty Rose": "#b98a8f",
        "Ivory": "#f3ead9", "Mauve": "#9a7b8c", "Mint": "#b7d3c0",
        "Rose Pink": "#d77a8c", "Rose Print": "#a24b5e", "Sand": "#d6bd93",
        "Slate Blue": "#7d8fa3", "White": "#ffffff"
      };
      function productColors(p) { return (p.colors && p.colors.length) ? p.colors : [p.color]; }
      function colorDots(p) {
        return productColors(p).map(function (c) {
          return '<span class="color-dot" title="' + esc(c) + '" style="background:' + (COLOR_SWATCHES[c] || "#cccccc") + '"></span>';
        }).join("");
      }

      /* State, kept in memory for this visit only. */
      var cart = [];
      var lastOrder = null;
      var shopState = { category: "All", size: "All", color: "All" };
      var productState = { size: null, qty: 1, img: 0 };
      var menuOpen = false;
      var subscribed = false;
      var contactSent = false;
      var contactName = "";

      /* Routing with pushState, real paths, like the canonical build. */
      function parseRoute(pathname) {
        var clean = pathname.replace(/\/+$/, "") || "/";
        if (clean === "/shop") return { page: "shop" };
        if (clean.indexOf("/product/") === 0) return { page: "product", id: decodeURIComponent(clean.slice(9)) };
        if (clean === "/cart") return { page: "cart" };
        if (clean === "/checkout") return { page: "checkout" };
        if (clean === "/confirmation") return { page: "confirmation" };
        if (clean === "/about") return { page: "about" };
        if (clean === "/contact") return { page: "contact" };
        return { page: "home" };
      }
      function routePath(r) {
        if (r.page === "shop") return "/shop";
        if (r.page === "product") return "/product/" + r.id;
        if (r.page === "cart") return "/cart";
        if (r.page === "checkout") return "/checkout";
        if (r.page === "confirmation") return "/confirmation";
        if (r.page === "about") return "/about";
        if (r.page === "contact") return "/contact";
        return "/";
      }
      var route = parseRoute(window.location.pathname);
      function navigate(r, search) {
        var url = routePath(r) + (search || "");
        if (window.location.pathname + window.location.search !== url) {
          window.history.pushState({}, "", url);
        }
        if (r.page === "shop") {
          var params = new URLSearchParams(search || window.location.search);
          shopState = { category: params.get("category") || "All", size: "All", color: "All" };
        }
        if (r.page === "product") {
          var p = byId(r.id);
          productState = { size: p ? p.sizes[0] : "M", qty: 1, img: 0 };
        }
        menuOpen = false;
        route = r;
        render();
        window.scrollTo({ top: 0 });
      }
      window.addEventListener("popstate", function () {
        route = parseRoute(window.location.pathname);
        if (route.page === "shop") {
          var params = new URLSearchParams(window.location.search);
          shopState = { category: params.get("category") || "All", size: "All", color: "All" };
        }
        if (route.page === "product") {
          var p = byId(route.id);
          productState = { size: p ? p.sizes[0] : "M", qty: 1, img: 0 };
        }
        menuOpen = false;
        render();
        window.scrollTo({ top: 0 });
      });

      /* Logo: a needle and thread forming a soft T, drawn for Threadora. */
      function logoMark(size) {
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" role="img" aria-label="Threadora logo" style="flex-shrink:0">' +
          '<circle cx="24" cy="24" r="22.5" fill="none" stroke="#c5a46d" stroke-width="1.4"/>' +
          '<path d="M14 15 C 22 10, 30 20, 24 24 C 18 28, 26 36, 34 33" fill="none" stroke="#8a5f66" stroke-width="1.6" stroke-linecap="round"/>' +
          '<line x1="17" y1="13" x2="31" y2="35" stroke="#c5a46d" stroke-width="2" stroke-linecap="round"/>' +
          '<ellipse cx="30" cy="33.4" rx="2.6" ry="1.3" fill="none" stroke="#c5a46d" stroke-width="1.2" transform="rotate(58 30 33.4)"/>' +
          '<circle cx="14" cy="15" r="1.8" fill="#b98a8f"/></svg>';
      }

      function cartCount() { var n = 0; for (var i = 0; i < cart.length; i++) n += cart[i].qty; return n; }
      function cartLines() {
        var out = [];
        for (var i = 0; i < cart.length; i++) {
          var p = byId(cart[i].productId);
          if (p) out.push({ productId: cart[i].productId, size: cart[i].size, qty: cart[i].qty, product: p });
        }
        return out;
      }
      function addToCart(product, size, qty) {
        var found = false;
        for (var i = 0; i < cart.length; i++) {
          if (cart[i].productId === product.id && cart[i].size === size) {
            cart[i].qty = Math.min(20, cart[i].qty + qty);
            found = true;
          }
        }
        if (!found) cart.push({ productId: product.id, size: size, qty: qty });
        renderHeader();
        showToast(product.name + " (size " + size + ") added to your bag.");
      }
      function setLineQty(productId, size, qty) {
        if (qty <= 0) { removeLine(productId, size); return; }
        for (var i = 0; i < cart.length; i++) {
          if (cart[i].productId === productId && cart[i].size === size) cart[i].qty = Math.min(20, qty);
        }
        render();
      }
      function removeLine(productId, size) {
        cart = cart.filter(function (i) { return !(i.productId === productId && i.size === size); });
        render();
      }

      var toastTimer = null;
      function showToast(text) {
        var root = document.getElementById("toast-root");
        root.innerHTML = '<div class="toast toast-in" role="status">' + esc(text) +
          '<button type="button" id="toast-bag">View Bag</button></div>';
        document.getElementById("toast-bag").addEventListener("click", function () {
          root.innerHTML = "";
          navigate({ page: "cart" });
        });
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () { root.innerHTML = ""; }, 2600);
      }

      /* Product card */
      function productCard(p) {
        return '<article class="card">' +
          '<button type="button" class="card-photo-btn" data-nav-product="' + p.id + '" aria-label="View details of ' + esc(p.name) + '">' +
            '<img src="' + p.img + '" alt="' + esc(p.name) + '" class="product-photo" loading="lazy" />' +
          '</button>' +
          '<div class="card-body">' +
            '<h3 class="card-name">' + esc(p.name) + '</h3>' +
            '<p class="card-cat">' + esc(p.category) + '</p>' +
            '<p class="card-price">' + formatPrice(p.price) + '</p>' +
            '<p class="card-colors">' + esc(productColors(p).join(" · ")) + '</p>' +
            '<div class="card-actions">' +
              '<button type="button" class="btn-card-outline" data-nav-product="' + p.id + '">View Details</button>' +
              '<button type="button" class="btn-card-solid" data-quick-add="' + p.id + '" aria-label="Add ' + esc(p.name) + ' to bag in size ' + p.sizes[0] + '">Add to Bag</button>' +
            '</div>' +
          '</div></article>';
      }

      /* Pages */
      function homePage() {
        var featured = PRODUCTS.slice(0, 4).map(productCard).join("");
        var cats = [
          { name: "Dresses", blurb: "Gowns and midi dresses in dusty rose, mauve and champagne.", img: byId("rosewater-pleated-gown").img },
          { name: "Kurtis", blurb: "Embroidered and printed kurtis for graceful daily wear.", img: byId("blush-embroidered-kurti").img },
          { name: "Casual Wear", blurb: "Linen sets and easy pairings for slow, comfortable days.", img: byId("sand-linen-coord-set").img }
        ];
        var catCards = cats.map(function (c) {
          return '<article class="card"><img src="' + c.img + '" alt="' + c.name + ' at Threadora" style="aspect-ratio:4/3;width:100%;object-fit:cover;object-position:top" loading="lazy" />' +
            '<div style="padding:1rem 1.25rem">' +
            '<h3 class="font-display" style="font-size:22px;font-weight:600;margin:0">' + c.name + '</h3>' +
            '<p style="margin:0.25rem 0 0;font-size:14px;line-height:1.6;color:var(--dim)">' + c.blurb + '</p>' +
            '<button type="button" class="btn-card-solid" style="margin-top:0.75rem;padding:0.5rem 1.25rem;flex:none" data-nav-shop-cat="' + c.name + '">Shop ' + c.name + '</button>' +
            '</div></article>';
        }).join("");
        return '<main>' +
          '<section class="container" style="padding-top:1.5rem">' +
            '<div class="hero-split">' +
            '<img src="' + IMAGES.hero + '" alt="Woman wearing a flowing dusty rose gown from the new Threadora collection" />' +
            '<div class="panel hero-panel">' +
              '<h1 class="font-display" style="font-size:36px;font-weight:600;letter-spacing:0.12em;margin:0">ELEGANT EVERYDAY WEAR</h1>' +
              '<p class="font-display" style="margin:0.5rem 0 0;font-size:20px;font-style:italic;color:var(--accent-deep)">The New Collection</p>' +
              '<p style="margin:0.75rem auto 0;max-width:36rem;font-size:15px;line-height:1.6;color:var(--dim)">Soft silk tones, gentle pleats and embroidery, in dusty rose, muted mauve and champagne. Pieces made to be worn often and loved for a long time.</p>' +
              '<button type="button" class="btn-primary" style="margin-top:1.25rem" data-nav="shop">Shop the Collection</button>' +
            '</div>' +
            '</div>' +
          '</section>' +
          '<section class="container" style="padding-top:3rem">' +
            '<div style="text-align:center"><h2 class="font-display" style="font-size:30px;font-weight:600;letter-spacing:0.08em;margin:0">The New Collection</h2><div class="gold-rule"></div></div>' +
            '<div class="grid-featured">' + featured + '</div>' +
            '<div style="margin-top:1.75rem;text-align:center"><button type="button" class="btn-outline" data-nav="shop">View All Products</button></div>' +
          '</section>' +
          '<section class="container" style="padding-top:3.5rem">' +
            '<div class="split-2">' +
              '<img src="' + IMAGES.boutique + '" alt="Inside the Threadora boutique, rails of dresses and kurtis in soft colours" style="width:100%;object-fit:cover" loading="lazy" />' +
              '<div>' +
                '<h2 class="font-display" style="font-size:30px;font-weight:600;letter-spacing:0.06em;margin:0">A small boutique, a careful hand</h2>' +
                '<p style="margin:0.75rem 0 0;font-size:15px;line-height:1.75;color:var(--dim)">Threadora began with a simple wish: clothing that feels as soft as it looks. Every piece is chosen for its fabric first, then its cut, then the small finishing details that make a garment easy to live in.</p>' +
                '<p style="margin:0.75rem 0 0;font-size:15px;line-height:1.75;color:var(--dim)">We work in gentle colours that sit well together, so a dress, a kurti and a casual set from Threadora can share one wardrobe without effort.</p>' +
                '<button type="button" class="btn-outline" style="margin-top:1.25rem;padding:0.625rem 1.5rem;font-size:12px" data-nav="about">Our Story</button>' +
              '</div>' +
            '</div>' +
          '</section>' +
          '<section class="container" style="padding-top:3.5rem">' +
            '<div style="text-align:center"><h2 class="font-display" style="font-size:30px;font-weight:600;letter-spacing:0.08em;margin:0">Shop by Category</h2><div class="gold-rule"></div></div>' +
            '<div class="grid-cats">' + catCards + '</div>' +
          '</section>' +
        '</main>';
      }

      function shopPage() {
        var colors = [];
        var sizes = [];
        PRODUCTS.forEach(function (p) {
          productColors(p).forEach(function (c) { if (colors.indexOf(c) === -1) colors.push(c); });
          p.sizes.forEach(function (s) { if (sizes.indexOf(s) === -1) sizes.push(s); });
        });
        colors.sort();
        var filtered = PRODUCTS.filter(function (p) {
          return (shopState.category === "All" || p.category === shopState.category) &&
            (shopState.size === "All" || p.sizes.indexOf(shopState.size) !== -1) &&
            (shopState.color === "All" || productColors(p).indexOf(shopState.color) !== -1);
        });
        function options(list, current, allLabel) {
          var out = '<option value="All"' + (current === "All" ? " selected" : "") + '>' + allLabel + '</option>';
          list.forEach(function (v) { out += '<option value="' + esc(v) + '"' + (current === v ? " selected" : "") + '>' + esc(v) + '</option>'; });
          return out;
        }
        var body;
        if (filtered.length === 0) {
          body = '<div class="panel" style="padding:3rem 1.5rem;text-align:center">' +
            '<p class="font-display" style="font-size:24px;font-weight:600;margin:0">Nothing matches those filters</p>' +
            '<p style="margin:0.5rem 0 0;font-size:14px;color:var(--dim)">Try a different size or colour, or show everything.</p>' +
            '<button type="button" class="btn-primary" style="margin-top:1rem;padding:0.625rem 1.5rem;font-size:12px" id="show-all-empty">Show All</button></div>';
        } else {
          body = '<div class="grid-shop">' + filtered.map(productCard).join("") + '</div>';
        }
        return '<main class="container" style="padding-top:2rem">' +
          '<h1 class="font-display" style="font-size:36px;font-weight:600;letter-spacing:0.08em;text-align:center;margin:0">Shop</h1>' +
          '<p style="margin:0.5rem 0 0;text-align:center;font-size:15px;color:var(--dim)">Dresses, kurtis and casual wear, all in one place.</p>' +
          '<div class="shop-layout">' +
            '<aside aria-label="Filters" class="panel" style="padding:1.25rem;height:fit-content">' +
              '<div style="display:flex;align-items:center;justify-content:space-between">' +
                '<h2 class="font-display" style="font-size:20px;font-weight:600;margin:0">Filters</h2>' +
                '<button type="button" id="show-all" style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:var(--accent-deep);text-decoration:underline;text-underline-offset:4px;padding:0.25rem">Show All</button>' +
              '</div>' +
              '<div style="margin-top:1rem"><label for="filter-category" class="field-label">Category</label>' +
                '<select id="filter-category" aria-label="Category" class="field-input">' + options(CATEGORIES, shopState.category, "All categories") + '</select></div>' +
              '<div style="margin-top:1rem"><label for="filter-size" class="field-label">Size</label>' +
                '<select id="filter-size" aria-label="Size" class="field-input">' + options(sizes, shopState.size, "All sizes") + '</select></div>' +
              '<div style="margin-top:1rem"><label for="filter-color" class="field-label">Color</label>' +
                '<select id="filter-color" aria-label="Color" class="field-input">' + options(colors, shopState.color, "All colors") + '</select></div>' +
              '<p style="margin:1.25rem 0 0;font-size:14px;color:var(--dim)" role="status">' + filtered.length + ' of ' + PRODUCTS.length + ' products</p>' +
            '</aside>' +
            '<section aria-label="Products">' + body + '</section>' +
          '</div></main>';
      }

      function productPage(p) {
        var gallery = [p.img];
        PRODUCTS.forEach(function (o) {
          if (o.category === p.category && o.id !== p.id && gallery.length < 4) gallery.push(o.img);
        });
        var shown = gallery[productState.img] || gallery[0];
        var thumbs = gallery.map(function (g, i) {
          return '<button type="button" class="thumb-btn' + (productState.img === i ? " active" : "") + '" data-thumb="' + i + '" aria-label="Show photo ' + (i + 1) + ' of ' + esc(p.name) + '" aria-pressed="' + (productState.img === i) + '"><img src="' + g + '" alt="" class="thumb-img" /></button>';
        }).join("");
        var sizeOptions = p.sizes.map(function (s) {
          return '<option value="' + s + '"' + (productState.size === s ? " selected" : "") + '>' + s + '</option>';
        }).join("");
        var details = p.details.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join("");
        var related = PRODUCTS.filter(function (o) { return o.category === p.category && o.id !== p.id; }).slice(0, 3);
        var relatedHtml = "";
        if (related.length > 0) {
          relatedHtml = '<section style="margin-top:3.5rem">' +
            '<h2 class="font-display" style="font-size:30px;font-weight:600;letter-spacing:0.06em;margin:0">You may also like</h2><div class="gold-rule-left"></div>' +
            '<div class="grid-related">' + related.map(productCard).join("") + '</div></section>';
        }
        return '<main class="container" style="padding-top:1.5rem">' +
          '<nav aria-label="Breadcrumb" style="font-size:13px;color:var(--dim)">' +
            '<button type="button" style="padding:0.25rem 0;min-height:2rem" data-nav="home">Home</button>' +
            '<span aria-hidden="true"> / </span>' +
            '<button type="button" style="padding:0.25rem 0;min-height:2rem" data-nav-shop-cat="' + p.category + '">' + p.category + '</button>' +
            '<span aria-hidden="true"> / </span><span style="color:var(--text)">' + esc(p.name) + '</span>' +
          '</nav>' +
          '<button type="button" data-nav-shop-cat="' + p.category + '" style="margin-top:0.25rem;padding:0.25rem 0;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:var(--accent-deep);text-decoration:underline;text-underline-offset:4px">Back to ' + p.category + '</button>' +
          '<div class="split-2-top" style="margin-top:1rem;align-items:start">' +
            '<div>' +
              '<img src="' + shown + '" alt="' + esc(p.name) + ', view ' + (productState.img + 1) + '" class="panel" style="aspect-ratio:3/4;width:100%;object-fit:cover;object-position:top" />' +
              '<div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap" role="group" aria-label="Product photos">' + thumbs + '</div>' +
              '<p style="margin:0.5rem 0 0;font-size:13px;color:var(--dim)">Photo ' + (productState.img + 1) + ' shows this piece. The other photos show pieces from the same ' + p.category + ' collection, for fabric and colour reference.</p>' +
            '</div>' +
            '<div>' +
              '<h1 class="font-display" style="font-size:36px;font-weight:600;line-height:1.15;margin:0">' + esc(p.name) + '</h1>' +
              '<p style="margin:0.25rem 0 0;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:var(--dim)">' + p.category + '</p>' +
              '<p style="margin:0.75rem 0 0;font-size:24px;font-weight:500">' + formatPrice(p.price) + '</p>' +
              '<p style="margin:1rem 0 0;font-size:15px;line-height:1.75;color:var(--dim)">' + esc(p.description) + '</p>' +
              '<dl style="margin:1.25rem 0 0">' +
                '<div class="detail-list"><dt>Fabric</dt><dd>' + esc(p.fabric) + '</dd></div>' +
                '<div class="detail-list"><dt>Colour</dt><dd>' + esc(p.color) + '</dd></div>' +
                '<div class="detail-list"><dt>Colours</dt><dd><span style="display:inline-flex;gap:0.3rem;margin-right:0.5rem">' + colorDots(p) + '</span>' + esc(productColors(p).join(", ")) + '</dd></div>' +
              '</dl>' +
              '<ul style="margin:1rem 0 0;padding-left:1.25rem;font-size:14px;line-height:1.6;color:var(--dim)">' + details + '</ul>' +
              '<div style="margin-top:1.5rem"><label for="size-select" class="field-label">Size</label>' +
                '<select id="size-select" aria-label="Size" class="field-input" style="max-width:20rem">' + sizeOptions + '</select></div>' +
              '<div style="margin-top:1rem;display:flex;align-items:center;gap:0.75rem">' +
                '<span class="field-label">Quantity</span>' +
                '<div class="qty-control">' +
                  '<button type="button" class="qty-btn" id="qty-minus" aria-label="Decrease quantity">−</button>' +
                  '<span class="qty-value" aria-live="polite">' + productState.qty + '</span>' +
                  '<button type="button" class="qty-btn" id="qty-plus" aria-label="Increase quantity">+</button>' +
                '</div></div>' +
              '<button type="button" class="btn-primary btn-block" style="margin-top:1.5rem;max-width:28rem;padding:0.875rem 2rem" id="add-to-cart">Add to Cart</button>' +
              '<p style="margin:0.75rem 0 0;font-size:13px;color:var(--dim)">Cash on delivery. Pay when your order arrives.</p>' +
            '</div>' +
          '</div>' + relatedHtml + '</main>';
      }

      function cartPage() {
        var lines = cartLines();
        if (lines.length === 0) {
          return '<main class="container-narrow" style="padding-top:2rem">' +
            '<h1 class="font-display" style="font-size:36px;font-weight:600;letter-spacing:0.1em;text-align:center;text-transform:uppercase;margin:0">Your Bag</h1>' +
            '<div class="panel" style="margin-top:2rem;padding:3rem 1.5rem;text-align:center">' +
              '<p class="font-display" style="font-size:24px;font-weight:600;margin:0">Your bag is empty</p>' +
              '<p style="margin:0.5rem 0 0;font-size:14px;color:var(--dim)">Add a dress, a kurti or a casual set to begin.</p>' +
              '<button type="button" class="btn-primary" style="margin-top:1.25rem;padding:0.75rem 1.75rem;font-size:12px" data-nav="shop">Continue Shopping</button>' +
            '</div></main>';
        }
        var subtotal = 0;
        var items = lines.map(function (l) {
          subtotal += l.product.price * l.qty;
          return '<li class="cart-line">' +
            '<img src="' + l.product.img + '" alt="' + esc(l.product.name) + '" class="cart-thumb" />' +
            '<div style="min-width:0;flex:1">' +
              '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem">' +
                '<div><h2 class="font-display" style="font-size:19px;font-weight:600;line-height:1.3;margin:0">' + esc(l.product.name) + '</h2>' +
                '<p style="margin:0.125rem 0 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:var(--dim)">' + l.product.category + ' · Size ' + l.size + '</p></div>' +
                '<button type="button" data-remove="' + l.productId + '|' + l.size + '" aria-label="Remove ' + esc(l.product.name) + ' size ' + l.size + ' from bag" style="padding:0.25rem 0.5rem;font-size:20px;line-height:1;color:var(--dim);min-width:2.5rem;min-height:2.5rem">×</button>' +
              '</div>' +
              '<div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0.75rem">' +
                '<div class="qty-control">' +
                  '<button type="button" class="qty-btn-sm" data-dec="' + l.productId + '|' + l.size + '" aria-label="Decrease quantity of ' + esc(l.product.name) + '">−</button>' +
                  '<span class="qty-value">' + l.qty + '</span>' +
                  '<button type="button" class="qty-btn-sm" data-inc="' + l.productId + '|' + l.size + '" aria-label="Increase quantity of ' + esc(l.product.name) + '">+</button>' +
                '</div>' +
                '<p style="margin:0;font-size:15px;font-weight:500">' + formatPrice(l.product.price * l.qty) + '</p>' +
              '</div>' +
            '</div></li>';
        }).join("");
        return '<main class="container-narrow" style="padding-top:2rem">' +
          '<h1 class="font-display" style="font-size:36px;font-weight:600;letter-spacing:0.1em;text-align:center;text-transform:uppercase;margin:0">Your Bag</h1>' +
          '<ul class="cart-list">' + items + '</ul>' +
          '<div class="panel" style="margin-top:1.5rem;padding:1.25rem">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;font-size:16px"><span style="letter-spacing:0.08em">Subtotal</span><span style="font-weight:600">' + formatPrice(subtotal) + '</span></div>' +
            '<p style="margin:0.25rem 0 0;font-size:13px;color:var(--dim)">Delivery is free across Pakistan. Cash on delivery.</p>' +
            '<button type="button" class="btn-primary btn-block" style="margin-top:1rem;padding:0.875rem 2rem" data-nav="checkout">Proceed to Checkout</button>' +
            '<button type="button" class="btn-outline-block" style="margin-top:0.5rem" data-nav="shop">Continue Shopping</button>' +
          '</div></main>';
      }

      function checkoutPage() {
        var lines = cartLines();
        if (lines.length === 0) {
          return '<main class="container-narrow" style="padding-top:2rem">' +
            '<h1 class="font-display" style="font-size:36px;font-weight:600;letter-spacing:0.1em;text-align:center;text-transform:uppercase;margin:0">Checkout</h1>' +
            '<div class="panel" style="margin-top:2rem;padding:3rem 1.5rem;text-align:center">' +
              '<p class="font-display" style="font-size:24px;font-weight:600;margin:0">Your bag is empty</p>' +
              '<p style="margin:0.5rem 0 0;font-size:14px;color:var(--dim)">Add something you love first, then come back to checkout.</p>' +
              '<button type="button" class="btn-primary" style="margin-top:1.25rem;padding:0.75rem 1.75rem;font-size:12px" data-nav="shop">Go to Shop</button>' +
            '</div></main>';
        }
        var total = 0;
        var summary = lines.map(function (l) {
          total += l.product.price * l.qty;
          return '<li style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem;font-size:14px;margin-top:0.75rem"><span>' + esc(l.product.name) +
            '<span style="display:block;font-size:12px;color:var(--dim)">Size ' + l.size + ' · Qty ' + l.qty + '</span></span>' +
            '<span style="font-weight:500">' + formatPrice(l.product.price * l.qty) + '</span></li>';
        }).join("");
        return '<main class="container-mid" style="padding-top:2rem">' +
          '<h1 class="font-display" style="font-size:36px;font-weight:600;letter-spacing:0.1em;text-align:center;text-transform:uppercase;margin:0">Checkout</h1>' +
          '<form id="checkout-form" class="checkout-layout" novalidate>' +
            '<section aria-label="Shipping address" class="panel" style="padding:1.5rem 1.25rem;height:fit-content">' +
              '<h2 class="font-display" style="font-size:24px;font-weight:600;margin:0">Shipping Address</h2>' +
              '<div style="margin-top:1rem"><label for="co-name" class="field-label">Full name</label><input id="co-name" aria-label="Full name" class="field-input" required autocomplete="name" /></div>' +
              '<div style="margin-top:1rem"><label for="co-phone" class="field-label">Phone number</label><input id="co-phone" aria-label="Phone number" class="field-input" required autocomplete="tel" inputmode="tel" /></div>' +
              '<div style="margin-top:1rem"><label for="co-address" class="field-label">Address</label><textarea id="co-address" aria-label="Address" class="field-input" required rows="3" autocomplete="street-address"></textarea></div>' +
              '<div style="margin-top:1rem"><label for="co-city" class="field-label">City</label><input id="co-city" aria-label="City" class="field-input" required autocomplete="address-level2" /></div>' +
              '<div style="margin-top:1rem"><label for="co-notes" class="field-label">Order notes, optional</label><input id="co-notes" aria-label="Order notes, optional" class="field-input" /></div>' +
              '<p id="co-error" class="form-error" role="alert" style="margin:1rem 0 0;display:none"></p>' +
            '</section>' +
            '<aside aria-label="Order summary" class="panel" style="padding:1.5rem 1.25rem;height:fit-content">' +
              '<h2 class="font-display" style="font-size:24px;font-weight:600;margin:0">Order Summary</h2>' +
              '<ul style="margin:0.25rem 0 0;padding:0;list-style:none">' + summary + '</ul>' +
              '<div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:0.75rem;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--dim)"><span>Delivery</span><span>Free</span></div>' +
              '<div style="margin-top:0.5rem;display:flex;align-items:center;justify-content:space-between;font-size:17px"><span style="letter-spacing:0.06em">Total</span><span style="font-weight:600">' + formatPrice(total) + '</span></div>' +
              '<p style="margin:0.5rem 0 0;font-size:13px;color:var(--dim)">Cash on delivery. Pay when your order arrives.</p>' +
              '<button type="submit" class="btn-primary btn-block" style="margin-top:1.25rem;padding:0.875rem 2rem">Place Order</button>' +
            '</aside>' +
          '</form></main>';
      }

      function confirmationPage() {
        var inner;
        if (lastOrder) {
          inner = '<p style="margin:0.75rem 0 0;font-size:15px;color:var(--dim)">Your order number is <span style="font-weight:600;color:var(--text)">' + esc(lastOrder.orderNumber) + '</span>.</p>' +
            '<p style="margin:0.25rem 0 0;font-size:15px;color:var(--dim)">Total to pay on delivery: <span style="font-weight:600;color:var(--text)">' + formatPrice(lastOrder.total) + '</span></p>' +
            '<p style="margin:0.75rem 0 0;font-size:14px;line-height:1.6;color:var(--dim)">We will call your phone number to confirm before dispatch. Please keep your order number safe for any questions.</p>';
        } else {
          inner = '<p style="margin:0.75rem 0 0;font-size:15px;color:var(--dim)">There is no recent order to show. If you just placed one and this page reloaded, your order is still confirmed on this visit.</p>';
        }
        return '<main class="container-form" style="padding-top:3rem">' +
          '<div class="panel" style="padding:2.5rem 1.5rem;text-align:center">' +
            '<div style="display:flex;justify-content:center">' + logoMark(44) + '</div>' +
            '<h1 class="font-display" style="margin:1rem 0 0;font-size:36px;font-weight:600">Thank you for your order</h1>' +
            inner +
            '<button type="button" class="btn-primary" style="margin-top:1.5rem;padding:0.75rem 2rem;font-size:12px" data-nav="shop">Continue Shopping</button>' +
          '</div></main>';
      }

      function aboutPage() {
        return '<main class="container-mid" style="padding-top:2rem">' +
          '<h1 class="font-display" style="font-size:40px;font-weight:600;letter-spacing:0.1em;text-align:center;text-transform:uppercase;margin:0">Our Story</h1>' +
          '<p style="margin:0.75rem auto 0;max-width:42rem;text-align:center;font-size:15px;line-height:1.75;color:var(--dim)">Threadora is a small women\'s clothing store built around one idea: everyday clothing can still feel special. We choose soft fabrics, gentle colours and cuts that are easy to wear, then finish each piece with care.</p>' +
          '<div class="split-2" style="margin-top:2.25rem;align-items:start">' +
            '<figure style="margin:0"><img src="' + IMAGES.silkRose + '" alt="Dusty rose silk fabric draped in soft folds" style="aspect-ratio:4/3;width:100%;object-fit:cover" loading="lazy" />' +
            '<figcaption class="font-display" style="margin-top:0.5rem;text-align:center;font-size:18px;font-style:italic;color:var(--accent-deep)">Silk in dusty rose, the colour Threadora began with</figcaption></figure>' +
            '<figure style="margin:0"><img src="' + IMAGES.silkBlush + '" alt="Blush pink satin fabric swirled in a soft spiral" style="aspect-ratio:4/3;width:100%;object-fit:cover" loading="lazy" />' +
            '<figcaption class="font-display" style="margin-top:0.5rem;text-align:center;font-size:18px;font-style:italic;color:var(--accent-deep)">Blush satin, chosen for its gentle shine</figcaption></figure>' +
          '</div>' +
          '<section class="panel" style="margin-top:3rem;padding:2rem 1.5rem">' +
            '<h2 class="font-display" style="font-size:32px;font-weight:600;letter-spacing:0.06em;text-align:center;margin:0">Timeless Elegance</h2>' +
            '<div class="gold-rule"></div>' +
            '<div style="margin:1.25rem auto 0;max-width:42rem;font-size:15px;line-height:1.75;color:var(--dim)">' +
              '<p style="margin:0">Trends pass quickly. A well cut dress in a colour that suits you does not. Threadora pieces are made to stay in your wardrobe for years: pleats that hold their shape, embroidery stitched to last, and fabrics that feel kind on the skin.</p>' +
              '<p style="margin:1rem 0 0">Our palette of dusty rose, muted mauve, champagne and ivory runs through every collection, so pieces from different seasons still belong together. Dresses for evenings, kurtis for graceful days, and casual sets for everything in between.</p>' +
              '<p style="margin:1rem 0 0">Thank you for visiting our small store. We hope you find something here that feels like it was made for you.</p>' +
            '</div>' +
            '<div style="margin-top:1.75rem;text-align:center"><button type="button" class="btn-primary" style="padding:0.75rem 2rem;font-size:12px" data-nav="shop">Shop the Collection</button></div>' +
          '</section></main>';
      }

      function contactPage() {
        var formHtml;
        if (contactSent) {
          var first = contactName.split(" ")[0] || "friend";
          formHtml = '<div role="status">' +
            '<h2 class="font-display" style="font-size:24px;font-weight:600;margin:0">Message sent</h2>' +
            '<p style="margin:0.5rem 0 0;font-size:14px;line-height:1.6;color:var(--dim)">Thank you, ' + esc(first) + '. Your message is with us and we will get back to you soon.</p>' +
            '<button type="button" class="btn-card-outline" style="margin-top:1rem;padding:0.5rem 1.25rem;flex:none" id="contact-again">Write another message</button></div>';
        } else {
          formHtml = '<form id="contact-form" novalidate>' +
            '<div><label for="ct-name" class="field-label">Name</label><input id="ct-name" aria-label="Name" class="field-input" required autocomplete="name" /></div>' +
            '<div style="margin-top:1rem"><label for="ct-subject" class="field-label">Subject</label><input id="ct-subject" aria-label="Subject" class="field-input" required /></div>' +
            '<div style="margin-top:1rem"><label for="ct-message" class="field-label">Message</label><textarea id="ct-message" aria-label="Message" class="field-input" required rows="5"></textarea></div>' +
            '<p id="ct-error" class="form-error" role="alert" style="margin:0.75rem 0 0;display:none"></p>' +
            '<button type="submit" class="btn-primary btn-block" style="margin-top:1.25rem;padding:0.875rem 2rem">Submit</button></form>';
        }
        return '<main class="container-mid" style="padding-top:2rem">' +
          '<h1 class="font-display" style="font-size:40px;font-weight:600;letter-spacing:0.1em;text-align:center;text-transform:uppercase;margin:0">Get in Touch</h1>' +
          '<p style="margin:0.75rem auto 0;max-width:36rem;text-align:center;font-size:15px;line-height:1.75;color:var(--dim)">Questions about a size, an order or a fabric? Write to us here and we will reply as soon as we can.</p>' +
          '<div class="split-2-top" style="margin-top:2.25rem">' +
            '<div class="panel" style="padding:1.5rem 1.25rem">' + formHtml +
              '<div style="margin-top:1.5rem;border-top:1px solid var(--border);padding-top:1rem;font-size:14px;line-height:1.6;color:var(--dim)">' +
                '<p style="margin:0"><span style="color:var(--text);font-weight:500">Email:</span> to be added soon (placeholder)</p>' +
                '<p style="margin:0"><span style="color:var(--text);font-weight:500">Phone:</span> to be added soon (placeholder)</p>' +
                '<p style="margin:0"><span style="color:var(--text);font-weight:500">Studio address:</span> to be added soon (placeholder)</p>' +
              '</div>' +
            '</div>' +
            '<figure style="margin:0"><img src="' + IMAGES.boutique + '" alt="Inside the Threadora boutique with rails of soft coloured clothing" style="width:100%;object-fit:cover" loading="lazy" />' +
            '<figcaption class="font-display" style="margin-top:0.5rem;text-align:center;font-size:18px;font-style:italic;color:var(--accent-deep)">The Threadora boutique corner</figcaption></figure>' +
          '</div></main>';
      }

      /* Header and footer */
      function headerHtml() {
        var count = cartCount();
        var leftLinks = CATEGORIES.map(function (c) {
          return '<button type="button" class="nav-btn" data-nav-shop-cat="' + c + '">' + c + '</button>';
        }).join("");
        var mobileLinks = leftLinks +
          '<button type="button" class="nav-btn" data-nav="shop">Shop All</button>' +
          '<button type="button" class="nav-btn" data-nav="about">About</button>' +
          '<button type="button" class="nav-btn" data-nav="contact">Contact</button>';
        return '<header class="site-header"><div class="header-inner">' +
          '<div class="header-row">' +
            '<button type="button" class="menu-btn" id="menu-btn" aria-label="' + (menuOpen ? "Close menu" : "Open menu") + '" aria-expanded="' + menuOpen + '"><span aria-hidden="true">' + (menuOpen ? "✕" : "☰") + '</span></button>' +
            '<nav class="header-nav-left" aria-label="Categories">' + leftLinks + '</nav>' +
            '<button type="button" class="logo-btn" data-nav="home" aria-label="Threadora home">' + logoMark(34) + '<span class="logo-word">THREADORA</span></button>' +
            '<div class="header-nav-right">' +
              '<button type="button" class="nav-btn desktop-only" data-nav="shop">Shop</button>' +
              '<button type="button" class="nav-btn desktop-only" data-nav="about">About</button>' +
              '<button type="button" class="nav-btn desktop-only" data-nav="contact">Contact</button>' +
              '<button type="button" class="nav-btn bag-btn" data-nav="cart" aria-label="Your bag, ' + count + ' items">Bag' +
                (count > 0 ? '<span class="bag-count">' + count + '</span>' : '') + '</button>' +
            '</div>' +
          '</div>' +
          (menuOpen ? '<nav class="mobile-menu menu-in" aria-label="Menu">' + mobileLinks + '</nav>' : '') +
          '</div><div class="header-rule"></div></header>';
      }

      function footerHtml() {
        var links = CATEGORIES.map(function (c) {
          return '<button type="button" class="footer-link" data-nav-shop-cat="' + c + '">' + c + '</button>';
        }).join("") +
          '<button type="button" class="footer-link" data-nav="about">Our Story</button>' +
          '<button type="button" class="footer-link" data-nav="contact">Get in Touch</button>' +
          '<a class="footer-link" href="/admin.html">Admin Panel</a>';
        var news;
        if (subscribed) {
          news = '<p style="margin:0.75rem 0 0;font-size:14px;font-weight:500;color:var(--accent-deep)" role="status">Thank you, you are on the list.</p>';
        } else {
          news = '<form class="newsletter-form" id="newsletter-form" novalidate>' +
            '<label class="sr-only" for="newsletter-email">Email address</label>' +
            '<input id="newsletter-email" type="email" required placeholder="Your email address" class="newsletter-input" />' +
            '<button type="submit" class="newsletter-btn">Join</button></form>' +
            '<p id="newsletter-error" class="form-error" role="alert" style="margin:0.5rem 0 0;display:none"></p>';
        }
        return '<footer class="site-footer"><div class="footer-grid">' +
          '<div><div style="display:flex;align-items:center;gap:0.625rem">' + logoMark(30) +
            '<span class="font-display" style="font-size:22px;font-weight:600;letter-spacing:0.28em">THREADORA</span></div>' +
            '<p style="margin:0.75rem 0 0;font-size:14px;line-height:1.6;color:var(--dim)">Dresses, kurtis and casual wear in soft fabrics and gentle colours, made for elegant everyday dressing.</p></div>' +
          '<nav aria-label="Footer"><p style="margin:0 0 0.5rem;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:var(--dim)">Explore</p>' + links + '</nav>' +
          '<div><p style="margin:0 0 0.5rem;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:var(--dim)">Newsletter</p>' +
            '<p style="margin:0;font-size:14px;line-height:1.6;color:var(--dim)">New pieces and collection notes, sent occasionally. No noise, we promise.</p>' + news + '</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--border);padding:1rem 0;text-align:center"><p class="font-display" style="margin:0;font-size:15px;letter-spacing:0.3em;color:var(--dim)">THREADORA</p>' +
          '<p style="margin:0.375rem 0 0;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:var(--dim)">By Interlinkz</p></div>' +
        '</footer>';
      }

      function renderHeader() {
        var el = document.getElementById("site-header");
        if (el) { el.innerHTML = headerHtml(); wireHeader(); }
      }

      function render() {
        var pageHtml;
        if (route.page === "home") pageHtml = homePage();
        else if (route.page === "shop") pageHtml = shopPage();
        else if (route.page === "product") {
          var p = byId(route.id);
          if (p) pageHtml = productPage(p);
          else pageHtml = '<main class="container-form" style="padding:4rem 1rem;text-align:center"><p class="font-display" style="font-size:30px;font-weight:600;margin:0">This piece is not in the boutique</p><p style="margin:0.5rem 0 0;font-size:14px;color:var(--dim)">It may have sold out or the link may be old.</p><button type="button" class="btn-primary" style="margin-top:1.25rem;padding:0.625rem 1.5rem;font-size:12px" data-nav="shop">Back to Shop</button></main>';
        }
        else if (route.page === "cart") pageHtml = cartPage();
        else if (route.page === "checkout") pageHtml = checkoutPage();
        else if (route.page === "confirmation") pageHtml = confirmationPage();
        else if (route.page === "about") pageHtml = aboutPage();
        else if (route.page === "contact") pageHtml = contactPage();
        else pageHtml = homePage();
        document.getElementById("app").innerHTML =
          '<div id="site-header">' + headerHtml() + '</div>' +
          '<div class="page-in">' + pageHtml + '</div>' + footerHtml();
        wire();
      }

      function wireNavIn(rootEl) {
        if (!rootEl) return;
        rootEl.querySelectorAll("[data-nav]").forEach(function (el) {
          el.addEventListener("click", function () { navigate({ page: el.getAttribute("data-nav") }); });
        });
        rootEl.querySelectorAll("[data-nav-shop-cat]").forEach(function (el) {
          el.addEventListener("click", function () {
            navigate({ page: "shop" }, "?category=" + encodeURIComponent(el.getAttribute("data-nav-shop-cat")));
          });
        });
        rootEl.querySelectorAll("[data-nav-product]").forEach(function (el) {
          el.addEventListener("click", function () { navigate({ page: "product", id: el.getAttribute("data-nav-product") }); });
        });
      }

      function wireHeader() {
        var headerEl = document.getElementById("site-header");
        wireNavIn(headerEl);
        var menuBtn = document.getElementById("menu-btn");
        if (menuBtn) menuBtn.addEventListener("click", function () { menuOpen = !menuOpen; renderHeader(); });
      }

      function wire() {
        wireHeader();
        document.querySelectorAll("[data-nav]").forEach(function (el) {
          if (el.closest("#site-header")) return;
          el.addEventListener("click", function () { navigate({ page: el.getAttribute("data-nav") }); });
        });
        document.querySelectorAll("[data-nav-shop-cat]").forEach(function (el) {
          if (el.closest("#site-header")) return;
          el.addEventListener("click", function () {
            navigate({ page: "shop" }, "?category=" + encodeURIComponent(el.getAttribute("data-nav-shop-cat")));
          });
        });
        document.querySelectorAll("[data-nav-product]").forEach(function (el) {
          if (el.closest("#site-header")) return;
          el.addEventListener("click", function () { navigate({ page: "product", id: el.getAttribute("data-nav-product") }); });
        });
        document.querySelectorAll("[data-quick-add]").forEach(function (el) {
          el.addEventListener("click", function () {
            var p = byId(el.getAttribute("data-quick-add"));
            if (p) addToCart(p, p.sizes[0], 1);
          });
        });
        /* Shop filters */
        var fc = document.getElementById("filter-category");
        if (fc) fc.addEventListener("change", function () { shopState.category = fc.value; render(); });
        var fs = document.getElementById("filter-size");
        if (fs) fs.addEventListener("change", function () { shopState.size = fs.value; render(); });
        var fcol = document.getElementById("filter-color");
        if (fcol) fcol.addEventListener("change", function () { shopState.color = fcol.value; render(); });
        var showAll = document.getElementById("show-all");
        if (showAll) showAll.addEventListener("click", function () { shopState = { category: "All", size: "All", color: "All" }; render(); });
        var showAllEmpty = document.getElementById("show-all-empty");
        if (showAllEmpty) showAllEmpty.addEventListener("click", function () { shopState = { category: "All", size: "All", color: "All" }; render(); });
        /* Product detail */
        document.querySelectorAll("[data-thumb]").forEach(function (el) {
          el.addEventListener("click", function () { productState.img = parseInt(el.getAttribute("data-thumb"), 10); render(); });
        });
        var sizeSel = document.getElementById("size-select");
        if (sizeSel) sizeSel.addEventListener("change", function () { productState.size = sizeSel.value; });
        var qm = document.getElementById("qty-minus");
        if (qm) qm.addEventListener("click", function () { productState.qty = Math.max(1, productState.qty - 1); render(); });
        var qp = document.getElementById("qty-plus");
        if (qp) qp.addEventListener("click", function () { productState.qty = Math.min(9, productState.qty + 1); render(); });
        var atc = document.getElementById("add-to-cart");
        if (atc) atc.addEventListener("click", function () {
          var p = byId(route.id);
          if (p) addToCart(p, productState.size || p.sizes[0], productState.qty);
        });
        /* Cart lines */
        document.querySelectorAll("[data-inc]").forEach(function (el) {
          el.addEventListener("click", function () {
            var parts = el.getAttribute("data-inc").split("|");
            var line = null;
            cart.forEach(function (i) { if (i.productId === parts[0] && i.size === parts[1]) line = i; });
            if (line) setLineQty(parts[0], parts[1], line.qty + 1);
          });
        });
        document.querySelectorAll("[data-dec]").forEach(function (el) {
          el.addEventListener("click", function () {
            var parts = el.getAttribute("data-dec").split("|");
            var line = null;
            cart.forEach(function (i) { if (i.productId === parts[0] && i.size === parts[1]) line = i; });
            if (line) setLineQty(parts[0], parts[1], line.qty - 1);
          });
        });
        document.querySelectorAll("[data-remove]").forEach(function (el) {
          el.addEventListener("click", function () {
            var parts = el.getAttribute("data-remove").split("|");
            removeLine(parts[0], parts[1]);
          });
        });
        /* Checkout */
        var coForm = document.getElementById("checkout-form");
        if (coForm) coForm.addEventListener("submit", function (e) {
          e.preventDefault();
          var name = document.getElementById("co-name").value.trim();
          var phone = document.getElementById("co-phone").value.trim();
          var address = document.getElementById("co-address").value.trim();
          var city = document.getElementById("co-city").value.trim();
          var err = document.getElementById("co-error");
          function fail(msg) { err.textContent = msg; err.style.display = "block"; }
          if (name.length < 2) return fail("Please enter your full name.");
          if (phone.length < 7) return fail("Please enter a phone number we can reach you on.");
          if (address.length < 5) return fail("Please enter your full shipping address.");
          if (city.length < 2) return fail("Please enter your city.");
          err.style.display = "none";
          var lines = cartLines();
          var total = 0;
          lines.forEach(function (l) { total += l.product.price * l.qty; });
          var notes = document.getElementById("co-notes").value.trim();
          var items = lines.map(function (l) { return { productId: l.productId, size: l.size, qty: l.qty }; });
          fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: name, phone: phone, address: address, city: city, notes: notes, items: items }) })
            .then(function (r) { if (!r.ok) throw new Error("order"); return r.json(); })
            .then(function (saved) {
              lastOrder = { orderNumber: saved.orderNumber, total: saved.total };
              try { sessionStorage.setItem("threadora-last-order", JSON.stringify(lastOrder)); } catch (err2) {}
              cart = [];
              navigate({ page: "confirmation" });
            })
            .catch(function () { fail("Your order could not be placed. Please try again."); });
        });
        /* Contact */
        var ctForm = document.getElementById("contact-form");
        if (ctForm) ctForm.addEventListener("submit", function (e) {
          e.preventDefault();
          var name = document.getElementById("ct-name").value.trim();
          var subject = document.getElementById("ct-subject").value.trim();
          var message = document.getElementById("ct-message").value.trim();
          var err = document.getElementById("ct-error");
          function fail(msg) { err.textContent = msg; err.style.display = "block"; }
          if (name.length < 2) return fail("Please enter your name.");
          if (subject.length < 2) return fail("Please enter a subject.");
          if (message.length < 5) return fail("Please write a short message.");
          err.style.display = "none";
          fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, subject: subject, message: message }) })
            .then(function (r) { if (!r.ok) throw new Error("contact"); return r.json(); })
            .then(function () { contactName = name; contactSent = true; render(); })
            .catch(function () { fail("Your message could not be sent. Please try again."); });
        });
        var ctAgain = document.getElementById("contact-again");
        if (ctAgain) ctAgain.addEventListener("click", function () { contactSent = false; contactName = ""; render(); });
        /* Newsletter */
        var nlForm = document.getElementById("newsletter-form");
        if (nlForm) nlForm.addEventListener("submit", function (e) {
          e.preventDefault();
          var email = document.getElementById("newsletter-email").value.trim();
          var err = document.getElementById("newsletter-error");
          if (!email || email.indexOf("@") === -1 || email.indexOf(".") === -1) {
            err.textContent = "Please enter a valid email address.";
            err.style.display = "block";
            return;
          }
          fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email }) })
            .then(function (r) { if (!r.ok && r.status !== 409) throw new Error("newsletter"); return r.json(); })
            .then(function () { subscribed = true; render(); })
            .catch(function () { err.textContent = "Your email could not be saved. Please try again."; err.style.display = "block"; });
        });
      }

      /* Opening intro, with Skip intro. Shows once per visit session. */
      function initIntro() {
        var seen = false;
        try { seen = sessionStorage.getItem("threadora-intro-seen") === "1"; } catch (e) {}
        if (seen) return;
        var root = document.getElementById("intro-root");
        var letters = "THREADORA".split("").map(function (ch, i) {
          return '<span class="intro-letter" style="animation-delay:' + (i * 90) + 'ms" aria-hidden="true">' + ch + '</span>';
        }).join("");
        root.innerHTML = '<div class="intro-overlay" id="intro-overlay" role="dialog" aria-label="Threadora opening">' +
          '<div class="intro-box">' +
            '<div style="display:flex;justify-content:center;margin-bottom:1.25rem">' + logoMark(52) + '</div>' +
            '<p class="intro-word" aria-label="Threadora">' + letters + '</p>' +
            '<div class="intro-line"></div>' +
            '<p class="intro-tagline">Elegant everyday wear</p>' +
          '</div>' +
          '<button type="button" class="intro-skip" id="intro-skip">Skip intro</button>' +
        '</div>';
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          try { sessionStorage.setItem("threadora-intro-seen", "1"); } catch (e) {}
          var overlay = document.getElementById("intro-overlay");
          if (overlay) {
            overlay.classList.add("intro-leaving");
            window.setTimeout(function () { root.innerHTML = ""; }, 650);
          } else { root.innerHTML = ""; }
        }
        document.getElementById("intro-skip").addEventListener("click", finish);
        window.setTimeout(finish, 3400);
      }

      /* Restore a just placed order after a reload on the confirmation page. */
      try {
        var saved = sessionStorage.getItem("threadora-last-order");
        if (saved) lastOrder = JSON.parse(saved);
      } catch (e) {}

      fetch("/api/products")
        .then(function (r) { if (!r.ok) throw new Error("products"); return r.json(); })
        .then(function (data) { PRODUCTS = data; render(); initIntro(); })
        .catch(function () {
          document.getElementById("app").innerHTML = '<main class="container-mid" style="padding:4rem 1rem;text-align:center"><p class="font-display" style="font-size:24px;font-weight:600">The shop could not be loaded. Please refresh the page.</p></main>';
        });