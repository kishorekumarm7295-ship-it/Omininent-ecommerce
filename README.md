# OmniMart - All-in-One Full-Stack E-Commerce Platform

OmniMart is a modern, responsive, all-in-one universal e-commerce marketplace built from the ground up with a Python REST API backend and an interactive Single Page Application frontend.

---

## 🌟 Key Features

### 1. Universal Product Catalog ("All Products in One Website")
- **Multi-Category Coverage**: Electronics, Fashion & Apparel, Home & Living, Beauty & Health, Sports & Fitness, and Books & Stationery.
- **Search & Live Filtering**: Real-time keyword search, category pills, price range slider ($20 - $2,500), star ratings, and stock status filters.
- **Sorting Options**: Featured / Best Match, Price Low to High, Price High to Low, Highest Rated, and Most Popular.
- **Product Details & Specs**: Deep technical specification breakdown, stock quantity indicators, and high-res imagery.
- **Side-by-Side Comparison Matrix**: Compare up to 4 products side-by-side on price, rating, stock, and individual specs.

### 2. Multi-Gateway Payment Portal
- **Interactive Multi-Step Flow**:
  1. Shipping Address & Delivery preferences.
  2. Payment Method selection.
  3. Realistic 3D-Secure / Banking Fraud Shield processing simulation.
  4. Order Confirmation with order number, tracking number, and delivery estimates.
- **Payment Methods Supported**:
  - **Credit / Debit Card**: Interactive 3D credit card preview with real-time Luhn input formatting, card brand detection (Visa, Mastercard, Amex), CVV flip animation, and 1-click test card autofill (`4242 •••• 4242`).
  - **Instant UPI / QR Code**: High-resolution simulated QR code, UPI ID verification (`@okhdfcbank`, `@paytm`), and 5-minute active countdown timer.
  - **Net Banking**: Selection of major national and international banks.
  - **Cash on Delivery (COD)**: With dynamic security captcha verification.
- **Coupon & Promo Engine**:
  - `WELCOME20` - 20% Off entire order.
  - `MEGA50` - Up to $50 super savings.
  - `FREESHIP` - Free global express delivery.
- **Official Invoices**: Downloadable / Printable PDF-ready official order receipts with breakdown of subtotal, tax, discounts, and tracking.

### 3. Persistent Authentication & Saved Credentials
- **Password Security**: Passwords hashed using PBKDF2 with SHA-256 and unique cryptographic salt per user stored in SQLite.
- **Persistent Sessions**: Token-based authentication saved across browser refreshes.
- **"Remember Me"**: Automatically remembers user credentials.
- **1-Click Quick Accounts Switcher**:
  - **Customer**: `john@example.com` / `password123`
  - **Admin**: `admin@omnimart.com` / `admin123`
- **User Dashboard**: Live order shipment tracker (Order Placed -> Shipped -> Delivered) and past invoice reprint.

### 4. Admin & Merchant Center ("All Access")
- **Live Business Metrics**: Total Revenue, Total Orders, Active Product Catalog count, and Low Stock alerts.
- **Order Fulfillment**: Review customer orders and update shipment states (`Confirmed`, `Shipped`, `Delivered`, `Cancelled`).
- **Inventory Management**: Create new products, edit pricing/stock/badges, or remove discontinued items.

### 5. Internationalization & Customization
- **Currency Switcher**: Live conversion between USD ($), INR (₹), EUR (€), and GBP (£).
- **Dark & Light Mode**: Smooth theme toggling persisted in local storage.

---

## 🚀 How to Run

1. Open PowerShell or Command Prompt in this folder:
   ```cmd
   cd C:\Users\Admin\.gemini\antigravity\scratch\omnimart
