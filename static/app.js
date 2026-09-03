/**
 * OmniMart Full-Stack E-Commerce Application
 * Core Client Logic, State Management, Payment Gateways & Real-Time Reactivity
 */

const CURRENCY_RATES = {
  USD: { symbol: '$', rate: 1.0 },
  INR: { symbol: '₹', rate: 83.5 },
  EUR: { symbol: '€', rate: 0.92 },
  GBP: { symbol: '£', rate: 0.79 }
};

const VALID_COUPONS = {
  WELCOME20: { discountPercent: 20, desc: '20% Off Mega Welcome Discount' },
  MEGA50: { maxDiscount: 50, percent: 30, desc: '$50 Off Super Discount' },
  FREESHIP: { freeShipping: true, desc: '100% Free Shipping' }
};

class OmniMartApp {
  constructor() {
    // Application State
    this.products = [];
    this.filteredProducts = [];
    this.categories = [];
    this.selectedCategory = 'All';
    this.searchQuery = '';
    this.maxPrice = 2500;
    this.minRating = 0;
    this.inStockOnly = false;
    this.sortBy = 'featured';

    this.cart = this.loadLocal('omnimart_cart', []);
    this.wishlist = this.loadLocal('omnimart_wishlist', []);
    this.compareList = [];

    this.user = null;
    this.token = localStorage.getItem('omnimart_token') || null;
    this.currency = localStorage.getItem('omnimart_currency') || 'USD';
    this.theme = localStorage.getItem('omnimart_theme') || 'light';

    this.activeCoupon = null;
    this.detailProduct = null;
    this.detailQty = 1;
    this.currentOrder = null;

    // Payment Portal State
    this.paymentMethod = 'card';
    this.upiTimer = null;
    this.upiSecondsLeft = 300;
    this.codCaptcha = '8492';

    // Initialize
    this.init();
  }

  async init() {
    this.applyTheme(this.theme);
    this.updateCurrencyDropdown();
    this.initCodCaptcha();

    // Check persistent session
    if (this.token) {
      await this.verifySession();
    } else {
      this.renderAuthNav();
    }

    // Fetch catalog
    await this.fetchCategories();
    await this.fetchProducts();

    // Sync icons
    this.updateCartBadges();
    this.updateWishlistBadge();
    this.refreshIcons();
  }

  // --- Theme & Currency Helpers ---
  applyTheme(theme) {
    this.theme = theme;
    localStorage.setItem('omnimart_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      const icon = document.getElementById('theme-icon');
      if (icon) icon.setAttribute('data-lucide', 'sun');
    } else {
      document.documentElement.classList.remove('dark');
      const icon = document.getElementById('theme-icon');
      if (icon) icon.setAttribute('data-lucide', 'moon');
    }
    this.refreshIcons();
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  setCurrency(curr) {
    if (CURRENCY_RATES[curr]) {
      this.currency = curr;
      localStorage.setItem('omnimart_currency', curr);
      this.renderProducts();
      this.renderCart();
      this.updateCartBadges();
      this.toast(`Currency updated to ${curr}`);
    }
  }

  updateCurrencyDropdown() {
    const el = document.getElementById('currency-select');
    if (el) el.value = this.currency;
  }

  formatPrice(usdAmount) {
    const info = CURRENCY_RATES[this.currency] || CURRENCY_RATES.USD;
    const converted = usdAmount * info.rate;
    return `${info.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // --- API Client ---
  async api(endpoint, options = {}) {
    options.headers = options.headers || {};
    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (options.body && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = jsonBody(options.body);
    }
    try {
      const res = await fetch(endpoint, options);
      return await res.json();
    } catch (err) {
      console.error('API Request error:', err);
      return { success: false, error: err.message };
    }
  }

  // --- Local Storage Helpers ---
  loadLocal(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }

  saveLocal(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  // --- Auth & Persistent Credentials ---
  async verifySession() {
    const res = await this.api('/api/auth/me');
    if (res.success && res.user) {
      this.user = res.user;
    } else {
      this.user = null;
      this.token = null;
      localStorage.removeItem('omnimart_token');
    }
    this.renderAuthNav();
  }

  renderAuthNav() {
    const container = document.getElementById('auth-nav-container');
    if (!container) return;

    if (this.user) {
      container.innerHTML = `
        <div class="flex items-center space-x-2">
          <button onclick="app.openProfileModal()" class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold">
            <div class="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-[11px]">
              ${this.user.name.charAt(0).toUpperCase()}
            </div>
            <span class="max-w-[100px] truncate hidden sm:inline">${this.user.name}</span>
          </button>
          ${this.user.role === 'admin' ? `
            <button onclick="app.openAdminModal()" title="Admin Control" class="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20">
              <i data-lucide="shield" class="w-4 h-4"></i>
            </button>
          ` : ''}
        </div>
      `;
    } else {
      container.innerHTML = `
        <button onclick="app.openAuthModal('login')" class="flex items-center gap-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg shadow-sm shadow-brand-500/20 transition-all">
          <i data-lucide="user" class="w-4 h-4"></i>
          <span>Sign In</span>
        </button>
      `;
    }
    this.refreshIcons();
  }

  openAuthModal(tab = 'login') {
    this.setAuthTab(tab);
    // Check if remember me has saved credentials
    const savedEmail = localStorage.getItem('omnimart_remember_email');
    if (savedEmail) {
      const el = document.getElementById('login-email');
      if (el) el.value = savedEmail;
    }
    this.openModal('auth-modal');
  }

  setAuthTab(tab) {
    const tabLogin = document.getElementById('auth-tab-login');
    const tabReg = document.getElementById('auth-tab-register');
    const formLogin = document.getElementById('login-form');
    const formReg = document.getElementById('register-form');

    if (tab === 'login') {
      tabLogin.className = 'flex-1 pb-3 text-brand-600 border-b-2 border-brand-600';
      tabReg.className = 'flex-1 pb-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
      formLogin.classList.remove('hidden');
      formReg.classList.add('hidden');
    } else {
      tabReg.className = 'flex-1 pb-3 text-brand-600 border-b-2 border-brand-600';
      tabLogin.className = 'flex-1 pb-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
      formReg.classList.remove('hidden');
      formLogin.classList.add('hidden');
    }
  }

  fillDemoUser(type) {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    if (type === 'customer') {
      emailEl.value = 'john@example.com';
      passEl.value = 'password123';
    } else {
      emailEl.value = 'admin@omnimart.com';
      passEl.value = 'admin123';
    }
    this.toast(`Autofilled demo ${type} credentials! Click Sign In.`);
  }

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;
    const errorEl = document.getElementById('login-error');

    errorEl.classList.add('hidden');

    const res = await this.api('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    if (res.success && res.token) {
      this.token = res.token;
      this.user = res.user;
      localStorage.setItem('omnimart_token', res.token);

      if (remember) {
        localStorage.setItem('omnimart_remember_email', email);
      } else {
        localStorage.removeItem('omnimart_remember_email');
      }

      // Sync guest cart
      if (this.cart.length > 0) {
        await this.api('/api/cart/sync', {
          method: 'POST',
          body: { items: this.cart }
        });
      }

      this.closeModal('auth-modal');
      this.renderAuthNav();
      this.toast(`Welcome back, ${this.user.name}!`);
    } else {
      errorEl.textContent = res.error || 'Invalid email or password.';
      errorEl.classList.remove('hidden');
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const address = document.getElementById('reg-address').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const errorEl = document.getElementById('register-error');

    errorEl.classList.add('hidden');

    const res = await this.api('/api/auth/register', {
      method: 'POST',
      body: { name, email, password, address, phone }
    });

    if (res.success && res.token) {
      this.token = res.token;
      this.user = res.user;
      localStorage.setItem('omnimart_token', res.token);
      localStorage.setItem('omnimart_remember_email', email);

      this.closeModal('auth-modal');
      this.renderAuthNav();
      this.toast('Account registered and credentials saved securely!');
    } else {
      errorEl.textContent = res.error || 'Registration failed.';
      errorEl.classList.remove('hidden');
    }
  }

  async logout() {
    await this.api('/api/auth/logout', { method: 'POST' });
    this.user = null;
    this.token = null;
    localStorage.removeItem('omnimart_token');
    this.closeModal('profile-modal');
    this.renderAuthNav();
    this.toast('Signed out successfully.');
  }

  // --- Catalog & Products ---
  async fetchCategories() {
    const res = await this.api('/api/categories');
    if (res.categories) {
      this.categories = res.categories;
      this.renderCategoryNav();
      this.renderCategoryFilters();
    }
  }

  async fetchProducts() {
    const res = await this.api('/api/products');
    if (res.products) {
      this.products = res.products;
      this.applyCatalogFilters();
    }
  }

  renderCategoryNav() {
    const container = document.getElementById('category-pills');
    if (!container) return;

    const allPill = `
      <button onclick="app.selectCategory('All')" class="px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${this.selectedCategory === 'All' ? 'bg-brand-600 text-white font-bold shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}">
        All Categories
      </button>
    `;

    const categoryPills = this.categories.map(c => `
      <button onclick="app.selectCategory('${c.name}')" class="px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${this.selectedCategory === c.name ? 'bg-brand-600 text-white font-bold shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}">
        ${c.name} <span class="opacity-60 text-[10px]">(${c.count})</span>
      </button>
    `).join('');

    container.innerHTML = allPill + categoryPills;
  }

  renderCategoryFilters() {
    const list = document.getElementById('category-filter-list');
    if (!list) return;

    const allRadio = `
      <label class="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs">
        <div class="flex items-center gap-2">
          <input type="radio" name="sidebar-category" value="All" ${this.selectedCategory === 'All' ? 'checked' : ''} onchange="app.selectCategory('All')" class="accent-brand-600">
          <span>All Categories</span>
        </div>
        <span class="text-slate-400 font-mono text-[11px]">${this.products.length || 20}</span>
      </label>
    `;

    const items = this.categories.map(c => `
      <label class="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs">
        <div class="flex items-center gap-2">
          <input type="radio" name="sidebar-category" value="${c.name}" ${this.selectedCategory === c.name ? 'checked' : ''} onchange="app.selectCategory('${c.name}')" class="accent-brand-600">
          <span>${c.name}</span>
        </div>
        <span class="text-slate-400 font-mono text-[11px]">${c.count}</span>
      </label>
    `).join('');

    list.innerHTML = allRadio + items;
  }

  selectCategory(cat) {
    this.selectedCategory = cat;
    this.renderCategoryNav();
    this.renderCategoryFilters();
    this.applyCatalogFilters();

    const indicator = document.getElementById('active-category-indicator');
    if (indicator) indicator.textContent = cat === 'All' ? 'All Categories' : cat;
  }

  handleSearchInput(q) {
    this.searchQuery = q.trim().toLowerCase();
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) {
      if (this.searchQuery.length > 0) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    this.applyCatalogFilters();
  }

  clearSearch() {
    this.searchQuery = '';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    this.applyCatalogFilters();
  }

  handlePriceFilter(val) {
    this.maxPrice = parseFloat(val);
    const label = document.getElementById('price-range-val');
    if (label) label.textContent = this.formatPrice(this.maxPrice);
    this.applyCatalogFilters();
  }

  handleRatingFilter(val) {
    this.minRating = parseFloat(val);
    this.applyCatalogFilters();
  }

  handleStockFilter(checked) {
    this.inStockOnly = checked;
    this.applyCatalogFilters();
  }

  handleSortChange(val) {
    this.sortBy = val;
    this.applyCatalogFilters();
  }

  resetFilters() {
    this.selectedCategory = 'All';
    this.searchQuery = '';
    this.maxPrice = 2500;
    this.minRating = 0;
    this.inStockOnly = false;
    this.sortBy = 'featured';

    const sInput = document.getElementById('search-input');
    if (sInput) sInput.value = '';
    const pRange = document.getElementById('price-range');
    if (pRange) pRange.value = 2500;
    const sCheck = document.getElementById('stock-filter');
    if (sCheck) sCheck.checked = false;

    this.renderCategoryNav();
    this.renderCategoryFilters();
    this.applyCatalogFilters();
    this.toast('All filters reset.');
  }

  applyCatalogFilters() {
    let result = [...this.products];

    // Category
    if (this.selectedCategory !== 'All') {
      result = result.filter(p => p.category === this.selectedCategory);
    }

    // Search query
    if (this.searchQuery) {
      result = result.filter(p => 
        p.title.toLowerCase().includes(this.searchQuery) ||
        p.description.toLowerCase().includes(this.searchQuery) ||
        p.category.toLowerCase().includes(this.searchQuery)
      );
    }

    // Price
    result = result.filter(p => p.price <= this.maxPrice);

    // Rating
    if (this.minRating > 0) {
      result = result.filter(p => p.rating >= this.minRating);
    }

    // Stock
    if (this.inStockOnly) {
      result = result.filter(p => p.stock > 0);
    }

    // Sorting
    if (this.sortBy === 'price_asc') {
      result.sort((a, b) => a.price - b.price);
    } else if (this.sortBy === 'price_desc') {
      result.sort((a, b) => b.price - a.price);
    } else if (this.sortBy === 'rating') {
      result.sort((a, b) => b.rating - a.rating);
    } else if (this.sortBy === 'popular') {
      result.sort((a, b) => b.reviews_count - a.reviews_count);
    } else {
      result.sort((a, b) => (b.featured || 0) - (a.featured || 0));
    }

    this.filteredProducts = result;
    this.renderProducts();
  }

  renderProducts() {
    const grid = document.getElementById('products-grid');
    const empty = document.getElementById('no-products-view');
    const countDisplay = document.getElementById('product-count-display');

    if (countDisplay) countDisplay.textContent = this.filteredProducts.length;

    if (!grid) return;

    if (this.filteredProducts.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    grid.innerHTML = this.filteredProducts.map(p => {
      const isWishlisted = this.wishlist.includes(p.id);
      const isCompared = this.compareList.some(item => item.id === p.id);
      const discount = Math.round(((p.original_price - p.price) / p.original_price) * 100);

      return `
        <div class="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-xl hover:border-brand-500/50 transition-all flex flex-col justify-between">
          
          <!-- Product Card Top Image & Badges -->
          <div class="relative overflow-hidden bg-slate-100 dark:bg-slate-800 p-6 flex items-center justify-center cursor-pointer" onclick="app.openProductDetail(${p.id})">
            <img 
              src="${p.image_url}" 
              alt="${p.title}" 
              class="h-48 w-full object-contain group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            >
            
            <!-- Badges -->
            <div class="absolute top-3 left-3 flex flex-col gap-1">
              ${p.badge ? `<span class="bg-brand-600 text-white text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full shadow-sm">${p.badge}</span>` : ''}
              ${discount > 0 ? `<span class="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Save ${discount}%</span>` : ''}
            </div>

            <!-- Floating Actions -->
            <div class="absolute top-3 right-3 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onclick="event.stopPropagation(); app.toggleWishlist(${p.id})" 
                title="Save to Wishlist"
                class="w-8 h-8 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-red-500 flex items-center justify-center shadow-md transition-colors"
              >
                <i data-lucide="heart" class="w-4 h-4 ${isWishlisted ? 'fill-red-500 text-red-500' : ''}"></i>
              </button>
              <button 
                onclick="event.stopPropagation(); app.toggleCompare(${p.id})" 
                title="Compare Specs"
                class="w-8 h-8 rounded-full bg-white dark:bg-slate-800 ${isCompared ? 'text-brand-600 font-bold' : 'text-slate-700 dark:text-slate-200'} hover:text-brand-600 flex items-center justify-center shadow-md transition-colors"
              >
                <i data-lucide="repeat" class="w-4 h-4"></i>
              </button>
            </div>

            <!-- Low stock alert -->
            ${p.stock <= 10 && p.stock > 0 ? `
              <div class="absolute bottom-2 left-3 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/80 px-2 py-0.5 rounded-md">
                Only ${p.stock} left in stock
              </div>
            ` : ''}
          </div>

          <!-- Product Card Body Info -->
          <div class="p-5 flex-1 flex flex-col justify-between space-y-3">
            <div>
              <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span class="uppercase font-semibold tracking-wider text-brand-600 dark:text-brand-400">${p.category}</span>
                <span class="flex items-center text-amber-500 font-bold">
                  ★ ${p.rating} <span class="text-slate-400 font-normal ml-1">(${p.reviews_count})</span>
                </span>
              </div>
              <h3 
                onclick="app.openProductDetail(${p.id})" 
                class="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 hover:text-brand-600 cursor-pointer transition-colors"
              >
                ${p.title}
              </h3>
            </div>

            <!-- Price & Add to Cart -->
            <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div class="text-base font-black text-slate-900 dark:text-white">
                  ${this.formatPrice(p.price)}
                </div>
                ${p.original_price > p.price ? `
                  <div class="text-xs text-slate-400 line-through">
                    ${this.formatPrice(p.original_price)}
                  </div>
                ` : ''}
              </div>

              <button 
                onclick="app.addToCart(${p.id})" 
                class="bg-brand-600 hover:bg-brand-700 text-white p-2.5 rounded-xl flex items-center gap-1 text-xs font-semibold shadow-md shadow-brand-600/20 active:scale-95 transition-all"
                title="Add to Shopping Cart"
              >
                <i data-lucide="shopping-cart" class="w-4 h-4"></i>
                <span class="hidden sm:inline">Add</span>
              </button>
            </div>
          </div>

        </div>
      `;
    }).join('');

    this.refreshIcons();
  }

  // --- Product Detail Modal ---
  openProductDetail(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    this.detailProduct = product;
    this.detailQty = 1;

    document.getElementById('detail-img').src = product.image_url;
    document.getElementById('detail-category').textContent = product.category;
    document.getElementById('detail-title').textContent = product.title;
    document.getElementById('detail-rating').textContent = `${product.rating} / 5.0`;
    document.getElementById('detail-reviews').textContent = `${product.reviews_count} verified reviews`;
    document.getElementById('detail-price').textContent = this.formatPrice(product.price);
    document.getElementById('detail-original-price').textContent = product.original_price > product.price ? this.formatPrice(product.original_price) : '';
    document.getElementById('detail-description').textContent = product.description;
    document.getElementById('detail-qty-val').textContent = '1';

    const badgeEl = document.getElementById('detail-badge');
    if (product.badge) {
      badgeEl.textContent = product.badge;
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }

    // Specifications List
    const specsEl = document.getElementById('detail-specs');
    if (product.specs && Object.keys(product.specs).length > 0) {
      specsEl.innerHTML = Object.entries(product.specs).map(([k, v]) => `
        <div class="bg-slate-50 dark:bg-slate-800/70 p-2 rounded-lg">
          <dt class="text-slate-400 font-medium">${k}</dt>
          <dd class="font-bold text-slate-800 dark:text-slate-200 mt-0.5">${v}</dd>
        </div>
      `).join('');
    } else {
      specsEl.innerHTML = '<span class="text-slate-400 text-xs">Standard specifications apply.</span>';
    }

    this.openModal('product-detail-modal');
  }

  adjustDetailQty(delta) {
    const newQty = this.detailQty + delta;
    if (newQty >= 1 && newQty <= (this.detailProduct?.stock || 50)) {
      this.detailQty = newQty;
      document.getElementById('detail-qty-val').textContent = this.detailQty;
    }
  }

  addDetailToCart() {
    if (this.detailProduct) {
      this.addToCart(this.detailProduct.id, this.detailQty);
      this.closeModal('product-detail-modal');
    }
  }

  toggleDetailWishlist() {
    if (this.detailProduct) {
      this.toggleWishlist(this.detailProduct.id);
    }
  }

  // --- Shopping Cart Management ---
  addToCart(productId, qty = 1) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const existingIndex = this.cart.findIndex(item => item.id === productId);
    if (existingIndex > -1) {
      this.cart[existingIndex].quantity += qty;
    } else {
      this.cart.push({
        id: product.id,
        title: product.title,
        price: product.price,
        original_price: product.original_price,
        image_url: product.image_url,
        category: product.category,
        stock: product.stock,
        quantity: qty
      });
    }

    this.saveLocal('omnimart_cart', this.cart);
    this.updateCartBadges();
    this.toast(`Added "${product.title}" to cart!`);

    // If authenticated, sync with server
    if (this.user) {
      const item = this.cart.find(i => i.id === productId);
      this.api('/api/cart', {
        method: 'POST',
        body: { product_id: productId, quantity: item.quantity }
      });
    }
  }

  updateCartQty(productId, qty) {
    if (qty <= 0) {
      this.cart = this.cart.filter(item => item.id !== productId);
      if (this.user) {
        this.api(`/api/cart/${productId}`, { method: 'DELETE' });
      }
    } else {
      const item = this.cart.find(i => i.id === productId);
      if (item) {
        item.quantity = qty;
        if (this.user) {
          this.api('/api/cart', {
            method: 'POST',
            body: { product_id: productId, quantity: qty }
          });
        }
      }
    }
    this.saveLocal('omnimart_cart', this.cart);
    this.renderCart();
    this.updateCartBadges();
  }

  removeCartItem(productId) {
    this.updateCartQty(productId, 0);
  }

  openCartDrawer() {
    this.renderCart();
    document.getElementById('cart-drawer-overlay').classList.remove('hidden');
    document.getElementById('cart-drawer').classList.remove('translate-x-full');
  }

  closeCartDrawer() {
    document.getElementById('cart-drawer-overlay').classList.add('hidden');
    document.getElementById('cart-drawer').classList.add('translate-x-full');
  }

  calculateCartTotals() {
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discount = 0;

    if (this.activeCoupon) {
      if (this.activeCoupon.discountPercent) {
        discount = subtotal * (this.activeCoupon.discountPercent / 100);
      } else if (this.activeCoupon.percent) {
        discount = Math.min(this.activeCoupon.maxDiscount || 50, subtotal * (this.activeCoupon.percent / 100));
      }
    }

    const freeShipping = subtotal >= 100 || (this.activeCoupon && this.activeCoupon.freeShipping);
    const shipping = (subtotal === 0 || freeShipping) ? 0 : 9.99;
    const taxableSubtotal = Math.max(0, subtotal - discount);
    const tax = taxableSubtotal * 0.08;
    const grandTotal = taxableSubtotal + shipping + tax;

    return { subtotal, discount, shipping, tax, grandTotal };
  }

  renderCart() {
    const container = document.getElementById('cart-items-container');
    const badge = document.getElementById('cart-count-badge');
    if (!container) return;

    const totalQty = this.cart.reduce((sum, i) => sum + i.quantity, 0);
    if (badge) badge.textContent = `${totalQty} items`;

    if (this.cart.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 space-y-3">
          <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <i data-lucide="shopping-cart" class="w-8 h-8"></i>
          </div>
          <h4 class="font-bold text-sm">Your cart is empty</h4>
          <p class="text-xs text-slate-400 max-w-xs mx-auto">Explore all products and add your favorite items to begin shopping.</p>
          <button onclick="app.closeCartDrawer()" class="mt-2 bg-brand-600 text-white px-4 py-2 rounded-xl text-xs font-semibold">
            Start Shopping
          </button>
        </div>
      `;
      this.updateCartSummaries(0, 0, 0, 0, 0);
      this.refreshIcons();
      return;
    }

    container.innerHTML = this.cart.map(item => `
      <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
        <img src="${item.image_url}" alt="${item.title}" class="w-16 h-16 object-contain rounded-xl bg-white dark:bg-slate-800 p-1">
        <div class="flex-1 min-w-0">
          <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate">${item.title}</h4>
          <div class="text-xs font-extrabold text-brand-600 dark:text-brand-400 mt-0.5">
            ${this.formatPrice(item.price)}
          </div>
          <div class="flex items-center gap-2 mt-2">
            <div class="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 text-xs">
              <button onclick="app.updateCartQty(${item.id}, ${item.quantity - 1})" class="px-2 py-0.5 hover:bg-slate-100">-</button>
              <span class="px-2.5 py-0.5 font-bold">${item.quantity}</span>
              <button onclick="app.updateCartQty(${item.id}, ${item.quantity + 1})" class="px-2 py-0.5 hover:bg-slate-100">+</button>
            </div>
            <button onclick="app.removeCartItem(${item.id})" class="text-slate-400 hover:text-red-500 text-xs p-1" title="Remove item">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    const totals = this.calculateCartTotals();
    this.updateCartSummaries(totals.subtotal, totals.discount, totals.shipping, totals.tax, totals.grandTotal);
    this.refreshIcons();
  }

  updateCartSummaries(subtotal, discount, shipping, tax, grandTotal) {
    document.getElementById('cart-subtotal').textContent = this.formatPrice(subtotal);
    document.getElementById('cart-shipping').textContent = shipping === 0 ? 'FREE' : this.formatPrice(shipping);
    document.getElementById('cart-tax').textContent = this.formatPrice(tax);
    document.getElementById('cart-grand-total').textContent = this.formatPrice(grandTotal);

    const discountRow = document.getElementById('cart-discount-row');
    if (discount > 0) {
      discountRow.classList.remove('hidden');
      document.getElementById('cart-discount').textContent = `-${this.formatPrice(discount)}`;
    } else {
      discountRow.classList.add('hidden');
    }

    const payAmount = document.getElementById('pay-btn-amount');
    if (payAmount) payAmount.textContent = this.formatPrice(grandTotal);
  }

  updateCartBadges() {
    const totalQty = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const badge = document.getElementById('cart-badge');
    const headerSub = document.getElementById('cart-header-subtotal');

    if (badge) {
      badge.textContent = totalQty;
      if (totalQty > 0) badge.classList.remove('hidden');
      else badge.classList.add('hidden');
    }
    if (headerSub) {
      headerSub.textContent = this.formatPrice(subtotal);
    }
  }

  applyCoupon() {
    const code = document.getElementById('cart-coupon-input').value.trim().toUpperCase();
    const feedback = document.getElementById('coupon-feedback');

    if (!code) return;

    if (VALID_COUPONS[code]) {
      this.activeCoupon = { code, ...VALID_COUPONS[code] };
      feedback.textContent = `Applied "${code}" (${this.activeCoupon.desc})`;
      feedback.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-bold';
      feedback.classList.remove('hidden');
      this.renderCart();
      this.toast(`Coupon ${code} applied successfully!`);
    } else {
      feedback.textContent = 'Invalid promo code. Try WELCOME20 or MEGA50.';
      feedback.className = 'text-xs text-red-500 font-medium';
      feedback.classList.remove('hidden');
    }
  }

  copyCoupon(code) {
    navigator.clipboard.writeText(code);
    this.toast(`Copied coupon code ${code} to clipboard!`);
    const input = document.getElementById('cart-coupon-input');
    if (input) input.value = code;
  }

  // --- Product Comparison Matrix ---
  toggleCompare(productId) {
    const existing = this.compareList.findIndex(p => p.id === productId);
    if (existing > -1) {
      this.compareList.splice(existing, 1);
      this.toast('Removed from comparison.');
    } else {
      if (this.compareList.length >= 4) {
        this.toast('You can compare up to 4 products at once.');
        return;
      }
      const prod = this.products.find(p => p.id === productId);
      if (prod) {
        this.compareList.push(prod);
        this.toast(`Added "${prod.title}" to compare.`);
      }
    }
    this.updateCompareFloatingBar();
    this.renderProducts();
  }

  clearComparison() {
    this.compareList = [];
    this.updateCompareFloatingBar();
    this.renderProducts();
  }

  updateCompareFloatingBar() {
    const bar = document.getElementById('compare-floating-bar');
    const count = document.getElementById('compare-count');
    if (!bar || !count) return;

    if (this.compareList.length > 0) {
      count.textContent = this.compareList.length;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  }

  openCompareModal() {
    if (this.compareList.length === 0) return;
    const table = document.getElementById('compare-table');
    if (!table) return;

    // Collect all spec keys
    const allKeys = new Set();
    this.compareList.forEach(p => {
      if (p.specs) Object.keys(p.specs).forEach(k => allKeys.add(k));
    });

    table.innerHTML = `
      <thead>
        <tr class="border-b border-slate-200 dark:border-slate-800">
          <th class="p-3 bg-slate-50 dark:bg-slate-800/60 w-36 font-bold">Feature</th>
          ${this.compareList.map(p => `
            <th class="p-3 text-center min-w-[180px]">
              <img src="${p.image_url}" alt="${p.title}" class="w-20 h-20 object-contain mx-auto mb-2">
              <div class="font-bold text-slate-900 dark:text-white line-clamp-2">${p.title}</div>
              <div class="text-brand-600 font-black mt-1">${this.formatPrice(p.price)}</div>
              <button onclick="app.addToCart(${p.id}); app.closeModal('compare-modal');" class="mt-2 bg-brand-600 text-white px-3 py-1 rounded-lg text-xs font-semibold">
                Add to Cart
              </button>
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
        <tr>
          <td class="p-3 font-semibold text-slate-500 bg-slate-50 dark:bg-slate-800/30">Category</td>
          ${this.compareList.map(p => `<td class="p-3 text-center font-bold">${p.category}</td>`).join('')}
        </tr>
        <tr>
          <td class="p-3 font-semibold text-slate-500 bg-slate-50 dark:bg-slate-800/30">Rating</td>
          ${this.compareList.map(p => `<td class="p-3 text-center text-amber-500 font-bold">★ ${p.rating} (${p.reviews_count})</td>`).join('')}
        </tr>
        <tr>
          <td class="p-3 font-semibold text-slate-500 bg-slate-50 dark:bg-slate-800/30">Stock Status</td>
          ${this.compareList.map(p => `<td class="p-3 text-center ${p.stock > 0 ? 'text-emerald-600 font-bold' : 'text-red-500'}">${p.stock > 0 ? `${p.stock} Available` : 'Out of Stock'}</td>`).join('')}
        </tr>
        ${Array.from(allKeys).map(k => `
          <tr>
            <td class="p-3 font-semibold text-slate-500 bg-slate-50 dark:bg-slate-800/30">${k}</td>
            ${this.compareList.map(p => `<td class="p-3 text-center">${p.specs?.[k] || '—'}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    `;

    this.openModal('compare-modal');
  }

  // --- Wishlist Management ---
  toggleWishlist(productId) {
    const idx = this.wishlist.indexOf(productId);
    if (idx > -1) {
      this.wishlist.splice(idx, 1);
      this.toast('Removed from wishlist.');
    } else {
      this.wishlist.push(productId);
      this.toast('Saved to wishlist!');
    }
    this.saveLocal('omnimart_wishlist', this.wishlist);
    this.updateWishlistBadge();
    this.renderProducts();

    if (this.user) {
      this.api('/api/wishlist', {
        method: 'POST',
        body: { product_id: productId }
      });
    }
  }

  updateWishlistBadge() {
    const badge = document.getElementById('wishlist-badge');
    if (!badge) return;
    badge.textContent = this.wishlist.length;
    if (this.wishlist.length > 0) badge.classList.remove('hidden');
    else badge.classList.add('hidden');
  }

  openWishlistModal() {
    const container = document.getElementById('wishlist-items-container');
    if (!container) return;

    const items = this.products.filter(p => this.wishlist.includes(p.id));

    if (items.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 space-y-2">
          <div class="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/50 text-red-500 flex items-center justify-center mx-auto">
            <i data-lucide="heart" class="w-6 h-6"></i>
          </div>
          <h4 class="font-bold text-sm">Your wishlist is empty</h4>
          <p class="text-xs text-slate-400">Click the heart icon on any product to bookmark it.</p>
        </div>
      `;
    } else {
      container.innerHTML = items.map(p => `
        <div class="flex items-center justify-between p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <div class="flex items-center gap-3">
            <img src="${p.image_url}" alt="${p.title}" class="w-12 h-12 object-contain bg-white dark:bg-slate-800 rounded-xl p-1">
            <div>
              <h4 class="font-bold text-xs line-clamp-1">${p.title}</h4>
              <span class="text-xs font-black text-brand-600">${this.formatPrice(p.price)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app.addToCart(${p.id}); app.toggleWishlist(${p.id}); app.openWishlistModal();" class="bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1">
              <i data-lucide="shopping-cart" class="w-3.5 h-3.5"></i> Add to Cart
            </button>
            <button onclick="app.toggleWishlist(${p.id}); app.openWishlistModal();" class="text-slate-400 hover:text-red-500 p-1.5">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('');
    }

    this.refreshIcons();
    this.openModal('wishlist-modal');
  }

  // --- Payment Portal Gateway & Checkout ---
  openPaymentPortal() {
    if (this.cart.length === 0) {
      this.toast('Your cart is empty! Add items first.');
      return;
    }

    this.closeCartDrawer();

    // Auto-fill user information if authenticated
    if (this.user) {
      document.getElementById('ship-name').value = this.user.name || '';
      document.getElementById('ship-email').value = this.user.email || '';
      document.getElementById('ship-address').value = this.user.address || '';
      document.getElementById('ship-phone').value = this.user.phone || '';
    }

    this.goToPaymentStep(1);
    this.openModal('payment-portal-modal');
  }

  goToPaymentStep(step) {
    // Hide all steps
    [1, 2, 3, 4].forEach(s => {
      const el = document.getElementById(`checkout-step-${s}`);
      if (el) el.classList.add('hidden');
    });

    const target = document.getElementById(`checkout-step-${step}`);
    if (target) target.classList.remove('hidden');

    // Update step indicators
    const node1 = document.getElementById('step-node-1');
    const node2 = document.getElementById('step-node-2');
    const node3 = document.getElementById('step-node-3');

    if (step === 1) {
      this.setStepActive(node1, true);
      this.setStepActive(node2, false);
      this.setStepActive(node3, false);
    } else if (step === 2) {
      this.setStepActive(node1, true);
      this.setStepActive(node2, true);
      this.setStepActive(node3, false);
    } else if (step >= 3) {
      this.setStepActive(node1, true);
      this.setStepActive(node2, true);
      this.setStepActive(node3, true);
    }
  }

  setStepActive(node, active) {
    if (!node) return;
    const badge = node.querySelector('span');
    if (active) {
      badge.className = 'w-7 h-7 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shadow-md';
    } else {
      badge.className = 'w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs flex items-center justify-center';
    }
  }

  setPaymentMethodTab(tab) {
    this.paymentMethod = tab;
    const tabs = ['card', 'upi', 'netbanking', 'cod'];
    tabs.forEach(t => {
      const btn = document.getElementById(`pay-tab-${t}`);
      const view = document.getElementById(`pay-view-${t}`);
      if (t === tab) {
        btn.className = 'text-brand-600 border-b-2 border-brand-600 pb-1 flex items-center gap-1.5 whitespace-nowrap font-bold';
        view.classList.remove('hidden');
      } else {
        btn.className = 'text-slate-500 hover:text-slate-900 dark:hover:text-white pb-1 flex items-center gap-1.5 whitespace-nowrap font-bold';
        view.classList.add('hidden');
      }
    });

    if (tab === 'upi') {
      this.startUpiTimer();
    } else {
      this.stopUpiTimer();
    }
  }

  // Credit Card Interactive 3D Flip & Preview
  flipCreditCard(isFlipped) {
    const card = document.getElementById('interactive-credit-card');
    if (!card) return;
    if (isFlipped) card.classList.add('flipped');
    else card.classList.remove('flipped');
  }

  handleCardNumberInput(input) {
    let val = input.value.replace(/\D/g, '');
    let formatted = '';
    for (let i = 0; i < val.length; i++) {
      if (i > 0 && i % 4 === 0) formatted += ' ';
      formatted += val[i];
    }
    input.value = formatted;

    const preview = document.getElementById('card-preview-number');
    preview.textContent = formatted || '•••• •••• •••• ••••';

    // Card network logo detection
    const logo = document.getElementById('card-network-logo');
    if (val.startsWith('4')) logo.textContent = 'VISA';
    else if (val.startsWith('5')) logo.textContent = 'MASTERCARD';
    else if (val.startsWith('3')) logo.textContent = 'AMEX';
    else logo.textContent = 'CARD';
  }

  handleCardNameInput(input) {
    const preview = document.getElementById('card-preview-name');
    preview.textContent = input.value.toUpperCase() || 'CARD HOLDER';
  }

  handleCardExpInput(input) {
    let val = input.value.replace(/\D/g, '');
    if (val.length >= 2) {
      input.value = `${val.slice(0, 2)}/${val.slice(2, 4)}`;
    } else {
      input.value = val;
    }
    const preview = document.getElementById('card-preview-exp');
    preview.textContent = input.value || 'MM/YY';
  }

  handleCardCvvInput(input) {
    const preview = document.getElementById('card-preview-cvv');
    preview.textContent = input.value ? '•'.repeat(input.value.length) : '•••';
  }

  autofillTestCard() {
    const num = document.getElementById('input-card-number');
    const name = document.getElementById('input-card-name');
    const exp = document.getElementById('input-card-exp');
    const cvv = document.getElementById('input-card-cvv');

    num.value = '4242 4242 4242 4242';
    name.value = (this.user?.name || 'JOHN DOE').toUpperCase();
    exp.value = '12/28';
    cvv.value = '888';

    this.handleCardNumberInput(num);
    this.handleCardNameInput(name);
    this.handleCardExpInput(exp);
    this.handleCardCvvInput(cvv);

    this.toast('Autofilled 3D test card credentials!');
  }

  // UPI Countdown Timer
  startUpiTimer() {
    this.stopUpiTimer();
    this.upiSecondsLeft = 300;
    const el = document.getElementById('upi-countdown');
    this.upiTimer = setInterval(() => {
      this.upiSecondsLeft--;
      if (this.upiSecondsLeft <= 0) {
        this.stopUpiTimer();
        if (el) el.textContent = 'EXPIRED - Refresh';
      } else {
        const m = String(Math.floor(this.upiSecondsLeft / 60)).padStart(2, '0');
        const s = String(this.upiSecondsLeft % 60).padStart(2, '0');
        if (el) el.textContent = `${m}:${s}`;
      }
    }, 1000);
  }

  stopUpiTimer() {
    if (this.upiTimer) clearInterval(this.upiTimer);
  }

  verifyUpiId() {
    const id = document.getElementById('upi-id-input').value.trim();
    if (!id.includes('@')) {
      alert('Please enter a valid UPI ID (e.g. name@okhdfcbank or user@paytm)');
      return;
    }
    this.toast(`Verified UPI handle for: ${id}! Ready to pay.`);
  }

  // COD Captcha
  initCodCaptcha() {
    this.codCaptcha = Math.floor(1000 + Math.random() * 9000).toString();
    const el = document.getElementById('cod-captcha-display');
    if (el) el.textContent = this.codCaptcha;
  }

  refreshCodCaptcha() {
    this.initCodCaptcha();
  }

  // Execute Payment & Place Order
  async executePayment() {
    const name = document.getElementById('ship-name').value.trim() || (this.user?.name || 'Customer');
    const email = document.getElementById('ship-email').value.trim() || (this.user?.email || 'customer@omnimart.com');
    const address = document.getElementById('ship-address').value.trim() || '742 Evergreen Terrace, Springfield';
    const phone = document.getElementById('ship-phone').value.trim() || '+1 (555) 234-5678';

    if (this.paymentMethod === 'cod') {
      const captchaInput = document.getElementById('cod-captcha-input').value.trim();
      if (captchaInput !== this.codCaptcha) {
        alert('Invalid COD Captcha code. Please try again.');
        return;
      }
    }

    // Move to step 3: Processing Animation
    this.goToPaymentStep(3);

    const statusEl = document.getElementById('payment-process-status');
    const subEl = document.getElementById('payment-process-sub');
    const barEl = document.getElementById('payment-progress-bar');

    // Simulate Realistic Gateway Handshakes
    await this.delay(800);
    if (statusEl) statusEl.textContent = 'Contacting Card Issuer / Bank...';
    if (subEl) subEl.textContent = 'Validating payment token with 3D-Secure 2.0 gateway...';
    if (barEl) barEl.style.width = '60%';

    await this.delay(900);
    if (statusEl) statusEl.textContent = 'Securing Fraud Shield Verification...';
    if (subEl) subEl.textContent = 'Authorized by PCI-DSS Level 1 payment processor.';
    if (barEl) barEl.style.width = '90%';

    // Place Order via REST API
    const res = await this.api('/api/orders', {
      method: 'POST',
      body: {
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        shipping_address: address,
        payment_method: this.paymentMethod.toUpperCase(),
        coupon: this.activeCoupon?.code || '',
        items: this.cart
      }
    });

    await this.delay(500);

    if (res.success && res.order) {
      this.currentOrder = res.order;

      // Clear Cart
      this.cart = [];
      this.saveLocal('omnimart_cart', []);
      this.activeCoupon = null;
      this.updateCartBadges();

      // Show Step 4 Confirmation
      this.goToPaymentStep(4);
      document.getElementById('confirm-order-no').textContent = res.order.order_number;
      document.getElementById('confirm-track-no').textContent = res.order.tracking_number;
      document.getElementById('confirm-method').textContent = res.order.payment_method;
      
      const arrivalDate = new Date();
      arrivalDate.setDate(arrivalDate.getDate() + 3);
      document.getElementById('confirm-date').textContent = arrivalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById('confirm-address').textContent = res.order.shipping_address;

      this.toast('Payment authorized & order confirmed!');
      this.fetchProducts(); // refresh stock numbers
    } else {
      alert(`Payment failed: ${res.error || 'Please check your details.'}`);
      this.goToPaymentStep(2);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printOrderReceipt() {
    if (!this.currentOrder) return;
    const order = this.currentOrder;
    const printArea = document.getElementById('printable-receipt-area');

    printArea.innerHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #1e293b;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px;">
          <div>
            <h1 style="color: #4f46e5; margin: 0; font-size: 26px; font-weight: 800;">OmniMart Global</h1>
            <p style="margin: 3px 0; font-size: 12px; color: #64748b;">Universal Multi-Category Marketplace</p>
          </div>
          <div style="text-align: right;">
            <h3 style="margin: 0; font-size: 16px;">OFFICIAL INVOICE</h3>
            <p style="margin: 3px 0; font-size: 12px; font-weight: bold;">Order: ${order.order_number}</p>
            <p style="margin: 3px 0; font-size: 12px; color: #64748b;">Date: ${order.created_at || new Date().toLocaleString()}</p>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 12px;">
          <div>
            <strong>Billed & Shipped To:</strong>
            <p style="margin: 4px 0;">${order.customer_name}</p>
            <p style="margin: 4px 0;">${order.customer_email}</p>
            <p style="margin: 4px 0;">${order.shipping_address}</p>
          </div>
          <div style="text-align: right;">
            <strong>Payment Info:</strong>
            <p style="margin: 4px 0;">Method: ${order.payment_method}</p>
            <p style="margin: 4px 0;">Tracking ID: <strong>${order.tracking_number}</strong></p>
            <p style="margin: 4px 0; color: #059669; font-weight: bold;">Status: PAID & VERIFIED</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
              <th style="padding: 10px; text-align: left;">Item Description</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Unit Price</th>
              <th style="padding: 10px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px;"><strong>${item.product_title}</strong></td>
                <td style="padding: 10px; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; text-align: right;">${this.formatPrice(item.price)}</td>
                <td style="padding: 10px; text-align: right;">${this.formatPrice(item.price * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
          <div style="width: 250px; font-size: 12px; line-height: 1.8;">
            <div style="display: flex; justify-content: space-between;">
              <span>Subtotal:</span>
              <strong>${this.formatPrice(order.subtotal)}</strong>
            </div>
            ${order.discount_amount > 0 ? `
              <div style="display: flex; justify-content: space-between; color: #059669;">
                <span>Discount:</span>
                <strong>-${this.formatPrice(order.discount_amount)}</strong>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between;">
              <span>Shipping:</span>
              <strong>${order.shipping_fee === 0 ? 'FREE' : this.formatPrice(order.shipping_fee)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Tax (8%):</span>
              <strong>${this.formatPrice(order.tax_amount)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 5px; font-size: 15px; margin-top: 5px;">
              <span>Total Paid:</span>
              <strong style="color: #4f46e5;">${this.formatPrice(order.total_amount)}</strong>
            </div>
          </div>
        </div>

        <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #94a3b8;">
          <p>Thank you for shopping at OmniMart. For questions or returns within 30 days, contact support@omnimart.com.</p>
        </div>
      </div>
    `;

    printArea.classList.remove('hidden');
    window.print();
    printArea.classList.add('hidden');
  }

  // --- Profile & Order History Modal ---
  async openProfileModal() {
    if (!this.user) {
      this.openAuthModal('login');
      return;
    }

    document.getElementById('profile-name').textContent = this.user.name;
    document.getElementById('profile-email').textContent = this.user.email;
    document.getElementById('profile-avatar-initial').textContent = this.user.name.charAt(0).toUpperCase();
    document.getElementById('profile-role-badge').textContent = this.user.role;
    document.getElementById('profile-address-preview').textContent = this.user.address ? `📍 ${this.user.address}` : 'No address set';

    const list = document.getElementById('profile-orders-list');
    list.innerHTML = '<div class="text-xs text-slate-400 py-4">Loading your order history...</div>';

    this.openModal('profile-modal');

    // Fetch user orders
    const res = await this.api('/api/orders');
    if (res.orders && res.orders.length > 0) {
      list.innerHTML = res.orders.map(order => `
        <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3 text-xs">
          <div class="flex items-center justify-between">
            <div>
              <span class="font-bold font-mono text-slate-900 dark:text-white">${order.order_number}</span>
              <span class="text-slate-400 text-[11px] ml-2">${order.created_at}</span>
            </div>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              ${order.order_status}
            </span>
          </div>

          <!-- Items preview -->
          <div class="space-y-1">
            ${order.items.map(i => `
              <div class="flex justify-between text-slate-600 dark:text-slate-300">
                <span class="truncate max-w-xs">• ${i.product_title} × ${i.quantity}</span>
                <span class="font-semibold">${this.formatPrice(i.price * i.quantity)}</span>
              </div>
            `).join('')}
          </div>

          <!-- Status Timeline Tracker -->
          <div class="pt-2 border-t border-slate-200 dark:border-slate-700">
            <div class="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1">
              <span class="text-brand-600">Order Placed</span>
              <span class="${['Shipped', 'Delivered'].includes(order.order_status) ? 'text-brand-600' : ''}">Shipped</span>
              <span class="${order.order_status === 'Delivered' ? 'text-emerald-600' : ''}">Delivered</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div class="bg-brand-600 h-full ${order.order_status === 'Delivered' ? 'w-full bg-emerald-500' : order.order_status === 'Shipped' ? 'w-2/3' : 'w-1/3'}"></div>
            </div>
          </div>

          <div class="flex justify-between items-center pt-2">
            <span class="font-bold text-slate-900 dark:text-white">Total: ${this.formatPrice(order.total_amount)}</span>
            <button onclick="app.reprintPastInvoice('${order.id}')" class="text-brand-600 hover:underline font-bold flex items-center gap-1">
              <i data-lucide="printer" class="w-3.5 h-3.5"></i> View Invoice
            </button>
          </div>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<div class="text-xs text-slate-400 py-6 text-center">You haven\'t placed any orders yet.</div>';
    }

    this.refreshIcons();
  }

  async reprintPastInvoice(orderId) {
    const res = await this.api(`/api/orders/${orderId}`);
    if (res.order) {
      this.currentOrder = res.order;
      this.printOrderReceipt();
    }
  }

  // --- Admin Portal & Management ("All Access") ---
  async openAdminModal() {
    if (!this.user || this.user.role !== 'admin') {
      // Prompt quick admin login
      this.openAuthModal('login');
      this.fillDemoUser('admin');
      this.toast('Sign in with Admin credentials to access the Merchant Portal.');
      return;
    }

    this.setAdminTab('orders');
    this.openModal('admin-modal');
    await this.fetchAdminStats();
    await this.fetchAdminOrders();
    await this.fetchAdminProducts();
  }

  setAdminTab(tab) {
    const tabOrders = document.getElementById('admin-tab-orders');
    const tabProducts = document.getElementById('admin-tab-products');
    const viewOrders = document.getElementById('admin-view-orders');
    const viewProducts = document.getElementById('admin-view-products');

    if (tab === 'orders') {
      tabOrders.className = 'text-brand-600 border-b-2 border-brand-600 pb-2 flex items-center gap-1.5 font-bold';
      tabProducts.className = 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 pb-2 flex items-center gap-1.5 font-bold';
      viewOrders.classList.remove('hidden');
      viewProducts.classList.add('hidden');
    } else {
      tabProducts.className = 'text-brand-600 border-b-2 border-brand-600 pb-2 flex items-center gap-1.5 font-bold';
      tabOrders.className = 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 pb-2 flex items-center gap-1.5 font-bold';
      viewProducts.classList.remove('hidden');
      viewOrders.classList.add('hidden');
    }
  }

  async fetchAdminStats() {
    const res = await this.api('/api/admin/stats');
    if (res.total_revenue !== undefined) {
      document.getElementById('stat-revenue').textContent = this.formatPrice(res.total_revenue);
      document.getElementById('stat-orders').textContent = res.total_orders;
      document.getElementById('stat-products').textContent = res.total_products;
      document.getElementById('stat-low-stock').textContent = res.low_stock_count;
    }
  }

  async fetchAdminOrders() {
    const res = await this.api('/api/admin/orders');
    const tbody = document.getElementById('admin-orders-tbody');
    if (!tbody || !res.orders) return;

    tbody.innerHTML = res.orders.map(o => `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <td class="p-3 font-mono font-bold">${o.order_number}</td>
        <td class="p-3">
          <div class="font-bold">${o.customer_name}</div>
          <div class="text-[11px] text-slate-400">${o.customer_email}</div>
        </td>
        <td class="p-3 font-black">${this.formatPrice(o.total_amount)}</td>
        <td class="p-3">
          <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-[11px]">${o.payment_method}</span>
        </td>
        <td class="p-3">
          <select onchange="app.updateOrderStatus('${o.id}', this.value)" class="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-bold">
            <option value="Confirmed" ${o.order_status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="Shipped" ${o.order_status === 'Shipped' ? 'selected' : ''}>Shipped</option>
            <option value="Delivered" ${o.order_status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Cancelled" ${o.order_status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
        <td class="p-3">
          <button onclick="app.reprintPastInvoice('${o.id}')" class="text-brand-600 hover:underline font-bold">Print Receipt</button>
        </td>
      </tr>
    `).join('');
  }

  async updateOrderStatus(orderId, newStatus) {
    const res = await this.api(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      body: { status: newStatus }
    });
    if (res.success) {
      this.toast(`Order ${orderId} marked as ${newStatus}!`);
    }
  }

  async fetchAdminProducts() {
    const tbody = document.getElementById('admin-products-tbody');
    if (!tbody) return;

    tbody.innerHTML = this.products.map(p => `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <td class="p-3 flex items-center gap-2">
          <img src="${p.image_url}" alt="" class="w-8 h-8 object-contain rounded bg-white p-0.5 border">
          <span class="font-bold truncate max-w-xs">${p.title}</span>
        </td>
        <td class="p-3 font-semibold">${p.category}</td>
        <td class="p-3 font-black">${this.formatPrice(p.price)}</td>
        <td class="p-3 ${p.stock <= 10 ? 'text-amber-500 font-bold' : ''}">${p.stock}</td>
        <td class="p-3"><span class="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">${p.badge || '—'}</span></td>
        <td class="p-3 text-right space-x-2">
          <button onclick="app.openEditProductModal(${p.id})" class="text-brand-600 hover:underline font-bold">Edit</button>
          <button onclick="app.deleteProduct(${p.id})" class="text-red-500 hover:underline font-bold">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  openNewProductModal() {
    document.getElementById('product-form-title').textContent = 'Add New Product';
    document.getElementById('edit-prod-id').value = '';
    document.getElementById('prod-title').value = '';
    document.getElementById('prod-category').value = 'Electronics';
    document.getElementById('prod-badge').value = 'New Arrival';
    document.getElementById('prod-price').value = '99.99';
    document.getElementById('prod-original-price').value = '129.99';
    document.getElementById('prod-stock').value = '20';
    document.getElementById('prod-image').value = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800';
    document.getElementById('prod-desc').value = 'High performance product crafted with premium materials.';

    this.openModal('product-form-modal');
  }

  openEditProductModal(productId) {
    const p = this.products.find(item => item.id === productId);
    if (!p) return;

    document.getElementById('product-form-title').textContent = 'Edit Product';
    document.getElementById('edit-prod-id').value = p.id;
    document.getElementById('prod-title').value = p.title;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-badge').value = p.badge || '';
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-original-price').value = p.original_price;
    document.getElementById('prod-stock').value = p.stock;
    document.getElementById('prod-image').value = p.image_url;
    document.getElementById('prod-desc').value = p.description;

    this.openModal('product-form-modal');
  }

  async handleSaveProduct(e) {
    e.preventDefault();
    const id = document.getElementById('edit-prod-id').value;
    const title = document.getElementById('prod-title').value.trim();
    const category = document.getElementById('prod-category').value;
    const badge = document.getElementById('prod-badge').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const original_price = parseFloat(document.getElementById('prod-original-price').value || price);
    const stock = parseInt(document.getElementById('prod-stock').value);
    const image_url = document.getElementById('prod-image').value.trim();
    const description = document.getElementById('prod-desc').value.trim();

    let res;
    if (id) {
      res = await this.api(`/api/products/${id}`, {
        method: 'PUT',
        body: { title, category, badge, price, original_price, stock, image_url, description }
      });
    } else {
      res = await this.api('/api/products', {
        method: 'POST',
        body: { title, category, badge, price, original_price, stock, image_url, description, specs: { Origin: 'Imported', Warranty: '1 Year' } }
      });
    }

    if (res.success) {
      this.closeModal('product-form-modal');
      this.toast(id ? 'Product updated!' : 'New product created!');
      await this.fetchProducts();
      await this.fetchAdminProducts();
      await this.fetchAdminStats();
    } else {
      alert(`Error saving product: ${res.error}`);
    }
  }

  async deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product from OmniMart?')) return;
    const res = await this.api(`/api/products/${productId}`, { method: 'DELETE' });
    if (res.success) {
      this.toast('Product deleted from store.');
      await this.fetchProducts();
      await this.fetchAdminProducts();
      await this.fetchAdminStats();
    }
  }

  // --- Modal Helpers ---
  openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      this.refreshIcons();
    }
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
    if (id === 'payment-portal-modal') {
      this.stopUpiTimer();
    }
  }

  toast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto';
    toast.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 dark:text-emerald-600"></i> <span>${msg}</span>`;

    container.appendChild(toast);
    this.refreshIcons();

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }
}

// Global Helper
function jsonBody(obj) {
  return JSON.stringify(obj);
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new OmniMartApp();
});
