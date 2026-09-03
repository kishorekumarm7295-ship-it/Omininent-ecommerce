"""
OmniMart Database & Data Access Layer
Provides SQLite schema initialization, user auth helpers with PBKDF2,
and comprehensive catalog seeding with realistic products.
"""

import sqlite3
import os
import hashlib
import secrets
import json
from datetime import datetime, timedelta

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "omnimart.db")

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return key.hex(), salt

def verify_password(stored_hash: str, salt: str, provided_password: str) -> bool:
    key, _ = hash_password(provided_password, salt)
    return secrets.compare_digest(stored_hash, key)

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer',
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # User Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Products Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        original_price REAL NOT NULL,
        rating REAL NOT NULL DEFAULT 4.5,
        reviews_count INTEGER NOT NULL DEFAULT 120,
        stock INTEGER NOT NULL DEFAULT 25,
        image_url TEXT NOT NULL,
        description TEXT NOT NULL,
        specs_json TEXT DEFAULT '{}',
        badge TEXT DEFAULT '',
        featured INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Cart Items Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE(user_id, product_id)
    )
    """)

    # Wishlist Items Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS wishlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE(user_id, product_id)
    )
    """)

    # Orders Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        total_amount REAL NOT NULL,
        subtotal REAL NOT NULL,
        discount_amount REAL DEFAULT 0,
        shipping_fee REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'Paid',
        shipping_address TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT DEFAULT '',
        order_status TEXT NOT NULL DEFAULT 'Confirmed',
        tracking_number TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """)

    # Order Items Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_title TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
    """)

    conn.commit()

    # Seed Default Users if not present
    seed_users(cursor, conn)

    # Seed Products if empty
    seed_products(cursor, conn)

    conn.close()

def seed_users(cursor, conn):
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        # Pre-seed John Doe (Customer)
        hash1, salt1 = hash_password("password123")
        cursor.execute("""
        INSERT INTO users (name, email, password_hash, salt, role, address, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("John Doe", "john@example.com", hash1, salt1, "customer", "742 Evergreen Terrace, Springfield, OR 97477", "+1 (555) 234-5678"))

        # Pre-seed Admin
        hash2, salt2 = hash_password("admin123")
        cursor.execute("""
        INSERT INTO users (name, email, password_hash, salt, role, address, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("OmniMart Administrator", "admin@omnimart.com", hash2, salt2, "admin", "100 Innovation Way, Tech City, CA 94016", "+1 (800) 555-0199"))

        conn.commit()

def seed_products(cursor, conn):
    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
        sample_products = [
            # --- ELECTRONICS ---
            {
                "title": "UltraVision 4K Pro OLED Smart TV 65\"",
                "category": "Electronics",
                "price": 1299.99,
                "original_price": 1599.99,
                "rating": 4.9,
                "reviews_count": 348,
                "stock": 14,
                "image_url": "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&auto=format&fit=crop&q=80",
                "description": "Experience true black levels, infinite contrast, and cinema-grade Dolby Vision IQ with self-lit pixels and a 120Hz native refresh rate for next-gen gaming.",
                "specs_json": json.dumps({
                    "Screen Size": "65 Inches",
                    "Display Tech": "OLED 4K Ultra HD",
                    "Refresh Rate": "120 Hz",
                    "Audio": "60W Dolby Atmos",
                    "Warranty": "2 Years Manufacturer"
                }),
                "badge": "Best Seller",
                "featured": 1
            },
            {
                "title": "AeroSonic Wireless Noise-Cancelling Headphones",
                "category": "Electronics",
                "price": 249.99,
                "original_price": 349.99,
                "rating": 4.8,
                "reviews_count": 520,
                "stock": 38,
                "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80",
                "description": "Industry-leading hybrid active noise cancellation, 45-hour battery life, spatial audio tracking, and ultra-plush memory foam ear cups for all-day comfort.",
                "specs_json": json.dumps({
                    "Battery Life": "45 Hours",
                    "Noise Cancellation": "Active Hybrid ANC",
                    "Connectivity": "Bluetooth 5.3 / Multipoint",
                    "Weight": "250g",
                    "Warranty": "1 Year"
                }),
                "badge": "28% OFF",
                "featured": 1
            },
            {
                "title": "Apex Pro UltraBook 16\" (M3 Max / 32GB / 1TB)",
                "category": "Electronics",
                "price": 1999.00,
                "original_price": 2299.00,
                "rating": 4.9,
                "reviews_count": 184,
                "stock": 8,
                "image_url": "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80",
                "description": "Unprecedented computational power in an aerospace-grade aluminum chassis. Features Liquid Retina XDR display, 22-hour battery life, and pro studio array mics.",
                "specs_json": json.dumps({
                    "Processor": "16-Core High Performance",
                    "RAM": "32GB Unified Memory",
                    "Storage": "1TB NVMe Gen4 SSD",
                    "Display": "16.2\" Liquid Retina XDR",
                    "Battery": "Up to 22 Hours"
                }),
                "badge": "Top Rated",
                "featured": 1
            },
            {
                "title": "Chronos Titan Smartwatch Series 9",
                "category": "Electronics",
                "price": 329.99,
                "original_price": 399.99,
                "rating": 4.7,
                "reviews_count": 290,
                "stock": 22,
                "image_url": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
                "description": "Titanium case with sapphire crystal glass. Features precision dual-frequency GPS, continuous ECG monitoring, sleep apnea detection, and 100m water resistance.",
                "specs_json": json.dumps({
                    "Case Material": "Grade 5 Titanium",
                    "Water Resistance": "100m / 10 ATM",
                    "Sensors": "ECG, SpO2, Heart Rate, Skin Temp",
                    "Battery": "Up to 7 Days",
                    "Compatibility": "iOS & Android"
                }),
                "badge": "New Arrival",
                "featured": 0
            },
            {
                "title": "Lumina Mark IV Mirrorless Camera 45MP",
                "category": "Electronics",
                "price": 1749.50,
                "original_price": 1999.00,
                "rating": 4.8,
                "reviews_count": 142,
                "stock": 5,
                "image_url": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80",
                "description": "Full-frame 45MP BSI CMOS sensor capable of 8K RAW video recording, 8-stop in-body image stabilization, and lightning-fast AI autofocus tracking.",
                "specs_json": json.dumps({
                    "Sensor": "45.0 Megapixel Full-Frame BSI",
                    "Video": "8K 30p / 4K 120p RAW",
                    "Stabilization": "8-Stop 5-Axis IBIS",
                    "ISO Range": "100 - 51,200",
                    "Warranty": "2 Years"
                }),
                "badge": "Pro Choice",
                "featured": 0
            },

            # --- FASHION & APPAREL ---
            {
                "title": "Heritage Italian Leather Weekender Duffle",
                "category": "Fashion",
                "price": 189.00,
                "original_price": 260.00,
                "rating": 4.9,
                "reviews_count": 178,
                "stock": 19,
                "image_url": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80",
                "description": "Handcrafted from full-grain Tuscan vegetable-tanned leather. Features antique brass hardware, reinforced shoe compartment, and waterproof nylon lining.",
                "specs_json": json.dumps({
                    "Material": "100% Full-Grain Tuscan Leather",
                    "Dimensions": "21\" x 12\" x 11\"",
                    "Capacity": "45 Liters",
                    "Compartments": "Dedicated Laptop & Shoe Pockets",
                    "Origin": "Florence, Italy"
                }),
                "badge": "Handcrafted",
                "featured": 1
            },
            {
                "title": "UrbanShield All-Weather Technical Parka",
                "category": "Fashion",
                "price": 145.00,
                "original_price": 210.00,
                "rating": 4.6,
                "reviews_count": 215,
                "stock": 30,
                "image_url": "https://images.unsplash.com/photo-1544923246-77307dd654cb?w=800&auto=format&fit=crop&q=80",
                "description": "Engineered 3-layer Gore-Tex construction with taped seams, magnetic storm flap, PrimaLoft insulation, and ergonomic mobility patterning.",
                "specs_json": json.dumps({
                    "Shell": "3-Layer Waterproof Membrane (20,000mm)",
                    "Insulation": "PrimaLoft Gold 100g",
                    "Pockets": "6 Exterior, 2 Internal RFID-block",
                    "Care": "Machine Wash Cold"
                }),
                "badge": "Winter Sale",
                "featured": 0
            },
            {
                "title": "Veloce Classic Minimalist Chronograph",
                "category": "Fashion",
                "price": 119.99,
                "original_price": 169.99,
                "rating": 4.7,
                "reviews_count": 312,
                "stock": 45,
                "image_url": "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&auto=format&fit=crop&q=80",
                "description": "Sleek sunburst dial encased in 316L stainless steel, paired with an interchangeable genuine saddle-leather strap and Japanese Miyota quartz movement.",
                "specs_json": json.dumps({
                    "Case Diameter": "40mm",
                    "Movement": "Japanese Miyota Quartz",
                    "Water Resistance": "50 Meters",
                    "Glass": "Scratch-Resistant Sapphire"
                }),
                "badge": "Best Value",
                "featured": 0
            },
            {
                "title": "CloudStrider Premium Lightweight Runners",
                "category": "Fashion",
                "price": 135.00,
                "original_price": 175.00,
                "rating": 4.8,
                "reviews_count": 460,
                "stock": 28,
                "image_url": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80",
                "description": "Engineered breathable mesh upper with responsive superfoam midsole providing maximum energy return and seamless stride cushioning.",
                "specs_json": json.dumps({
                    "Upper": "Engineered PrimeKnit Mesh",
                    "Midsole": "SuperCritical Nitrogen Foam",
                    "Drop": "8mm",
                    "Weight": "215g (Size 9)"
                }),
                "badge": "Popular",
                "featured": 1
            },

            # --- HOME, LIVING & KITCHEN ---
            {
                "title": "BaristaPro Dual Boiler Espresso Machine",
                "category": "Home & Living",
                "price": 699.99,
                "original_price": 899.99,
                "rating": 4.9,
                "reviews_count": 410,
                "stock": 12,
                "image_url": "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800&auto=format&fit=crop&q=80",
                "description": "Commercial 58mm portafilter, dual stainless steel boilers for simultaneous extraction and microfoam steaming, PID temperature control, and pre-infusion.",
                "specs_json": json.dumps({
                    "Pump Pressure": "15 Bar Italian Vibration Pump",
                    "Boilers": "Dual Stainless Steel (Extraction & Steam)",
                    "Water Tank": "2.5 Liters Removable",
                    "Grinder": "Integrated Conical Burr with 30 Settings"
                }),
                "badge": "Editor's Pick",
                "featured": 1
            },
            {
                "title": "Aura Air Purifier Pro Max (HEPA-14 & Carbon)",
                "category": "Home & Living",
                "price": 199.99,
                "original_price": 279.99,
                "rating": 4.7,
                "reviews_count": 285,
                "stock": 20,
                "image_url": "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&auto=format&fit=crop&q=80",
                "description": "Medical-grade True HEPA H14 filtration capturing 99.995% of airborne particles down to 0.1 microns. Ultra-quiet 22dB sleep mode and Wi-Fi air quality dashboard.",
                "specs_json": json.dumps({
                    "Coverage": "Up to 1,200 sq. ft.",
                    "Filtration": "Pre-filter, True HEPA-14, Activated Carbon",
                    "Noise Level": "22dB - 52dB",
                    "Smart App": "iOS / Android / Alexa Compatible"
                }),
                "badge": "Health Essential",
                "featured": 0
            },
            {
                "title": "ErgoDynamic Velvet Accent Lounge Chair",
                "category": "Home & Living",
                "price": 289.00,
                "original_price": 380.00,
                "rating": 4.8,
                "reviews_count": 134,
                "stock": 9,
                "image_url": "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&auto=format&fit=crop&q=80",
                "description": "Mid-century modern aesthetic crafted with solid kiln-dried oak frame, high-density resilient foam cushioning, and stain-resistant plush emerald velvet.",
                "specs_json": json.dumps({
                    "Frame": "Solid Kiln-Dried European Oak",
                    "Upholstery": "Stain-Resistant Performance Velvet",
                    "Weight Capacity": "350 lbs",
                    "Assembly": "Easy 10-Minute Setup"
                }),
                "badge": "Design Icon",
                "featured": 0
            },
            {
                "title": "SmartSous Precision Culinary Immersion Cooker",
                "category": "Home & Living",
                "price": 89.99,
                "original_price": 129.99,
                "rating": 4.7,
                "reviews_count": 220,
                "stock": 35,
                "image_url": "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80",
                "description": "1200 Watts of heating power with accuracy to 0.1°F. Cook restaurant-quality steaks, salmon, and vegetables with built-in Wi-Fi and mobile recipe controls.",
                "specs_json": json.dumps({
                    "Power": "1200 Watts Fast Heating",
                    "Accuracy": "+/- 0.1°C (0.2°F)",
                    "Flow Rate": "10 Liters/min",
                    "Safety": "IPX7 Water Proof"
                }),
                "badge": "Chef Approved",
                "featured": 0
            },

            # --- BEAUTY & HEALTH ---
            {
                "title": "LuxeHydra 24K Peptide Anti-Aging Serum 50ml",
                "category": "Beauty & Health",
                "price": 54.99,
                "original_price": 85.00,
                "rating": 4.9,
                "reviews_count": 680,
                "stock": 60,
                "image_url": "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80",
                "description": "Dermatologist-developed formulation containing multi-molecular hyaluronic acid, copper tripeptides, niacinamide, and colloidal 24K gold flakes for radiant skin rejuvenation.",
                "specs_json": json.dumps({
                    "Skin Type": "All Skin Types / Sensitive",
                    "Key Actives": "Copper Tripeptide-1, 5% Niacinamide, HA",
                    "Volume": "50 ml / 1.7 fl oz",
                    "Standard": "Cruelty-Free, Paraben-Free, Vegan"
                }),
                "badge": "#1 Best Seller",
                "featured": 1
            },
            {
                "title": "SonicGlow Smart Facial Cleansing & Firming Device",
                "category": "Beauty & Health",
                "price": 79.99,
                "original_price": 119.99,
                "rating": 4.7,
                "reviews_count": 310,
                "stock": 25,
                "image_url": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80",
                "description": "Ultra-hygienic medical silicone with 12,000 T-Sonic pulsations per minute. Lifts away 99.5% of dirt, oil, and makeup residue while stimulating collagen synthesis.",
                "specs_json": json.dumps({
                    "Pulsations": "12,000 per minute",
                    "Material": "Ultra-Hygienic Body-Safe Silicone",
                    "Waterproof": "IPX8 Submersible",
                    "Battery": "Up to 300 uses per charge"
                }),
                "badge": "Spa Quality",
                "featured": 0
            },
            {
                "title": "TheraPulse Pro Deep-Tissue Percussion Massager",
                "category": "Beauty & Health",
                "price": 129.00,
                "original_price": 199.00,
                "rating": 4.8,
                "reviews_count": 490,
                "stock": 18,
                "image_url": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&auto=format&fit=crop&q=80",
                "description": "Brushless high-torque motor delivering 16mm amplitude for true deep-tissue relief. Includes 6 custom therapeutic heads and whisper-quiet QuietGlide engineering.",
                "specs_json": json.dumps({
                    "Amplitude": "16mm Muscle Penetration",
                    "Speed Range": "1600 - 3200 RPM (5 Levels)",
                    "Battery": "2600mAh (6 Hours Continuous)",
                    "Noise": "< 45dB Whisper Quiet"
                }),
                "badge": "Athletes Choice",
                "featured": 0
            },

            # --- SPORTS & FITNESS ---
            {
                "title": "TitanGrip Adjustable Smart Dumbbells (5 - 52.5 lbs)",
                "category": "Sports & Fitness",
                "price": 299.99,
                "original_price": 420.00,
                "rating": 4.9,
                "reviews_count": 550,
                "stock": 15,
                "image_url": "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=800&auto=format&fit=crop&q=80",
                "description": "Replaces 15 pairs of traditional weights with a rapid 1-second dial turn. Engineered with knurled steel grips and impact-resistant polymer coating.",
                "specs_json": json.dumps({
                    "Weight Range": "5 to 52.5 lbs per dumbbell",
                    "Adjustments": "15 Increments",
                    "Mechanism": "Quick-Turn Safety Locking Dial",
                    "Tray": "Durable Storage Cradle Included"
                }),
                "badge": "Top Seller",
                "featured": 1
            },
            {
                "title": "ZenMat Premium Eco-Cork Extra-Thick Yoga Mat",
                "category": "Sports & Fitness",
                "price": 49.99,
                "original_price": 75.00,
                "rating": 4.8,
                "reviews_count": 270,
                "stock": 50,
                "image_url": "https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800&auto=format&fit=crop&q=80",
                "description": "Sustainably harvested organic cork surface fused with non-slip natural rubber base. Unbeatable wet and dry grip that naturally resists odors and bacteria.",
                "specs_json": json.dumps({
                    "Dimensions": "72\" x 26\" x 6mm Thick",
                    "Material": "100% Organic Cork + Natural Tree Rubber",
                    "Weight": "5.5 lbs",
                    "Includes": "Heavy-Duty Cotton Carry Strap"
                }),
                "badge": "Eco Friendly",
                "featured": 0
            },
            {
                "title": "AeroRide Carbon Pro Road Cycling Helmet",
                "category": "Sports & Fitness",
                "price": 110.00,
                "original_price": 160.00,
                "rating": 4.7,
                "reviews_count": 165,
                "stock": 24,
                "image_url": "https://images.unsplash.com/photo-1557683316-973673baf926?w=800&auto=format&fit=crop&q=80",
                "description": "Wind-tunnel tested aerodynamics featuring MIPS rotational impact protection, 18 internal cooling ventilation channels, and magnetic Fidlock buckle.",
                "specs_json": json.dumps({
                    "Safety": "MIPS Brain Protection System",
                    "Vents": "18 Wind-Tunnel Air Channels",
                    "Weight": "240g Featherlight",
                    "Certification": "CPSC & CE EN 1078 Certified"
                }),
                "badge": "Safety First",
                "featured": 0
            },

            # --- BOOKS & STATIONERY ---
            {
                "title": "The Art of System Architecture & Engineering (Hardcover)",
                "category": "Books & Stationery",
                "price": 44.99,
                "original_price": 59.99,
                "rating": 4.9,
                "reviews_count": 380,
                "stock": 40,
                "image_url": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80",
                "description": "The definitive collector's edition guide to distributed systems, high-concurrency microservices, data consistency, and cloud design patterns.",
                "specs_json": json.dumps({
                    "Format": "Collector's Gold-Embossed Hardcover",
                    "Pages": "680 Pages",
                    "Language": "English",
                    "Publisher": "O'Reilly & Associates"
                }),
                "badge": "Must Read",
                "featured": 1
            },
            {
                "title": "Precision Brass & Walnut Fountain Pen Set",
                "category": "Books & Stationery",
                "price": 38.50,
                "original_price": 60.00,
                "rating": 4.8,
                "reviews_count": 210,
                "stock": 35,
                "image_url": "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=800&auto=format&fit=crop&q=80",
                "description": "Solid hand-turned North American walnut barrel paired with precision German iridium fine nib and solid brass accents. Includes ink converter and presentation case.",
                "specs_json": json.dumps({
                    "Nib": "German Iridium Fine Point (0.5mm)",
                    "Materials": "American Walnut & Solid Brass",
                    "Ink System": "Cartridge & Bottled Ink Converter",
                    "Packaging": "Velvet-Lined Wooden Keepsake Box"
                }),
                "badge": "Gift Favorite",
                "featured": 0
            }
        ]

        for p in sample_products:
            cursor.execute("""
            INSERT INTO products (title, category, price, original_price, rating, reviews_count, stock, image_url, description, specs_json, badge, featured)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                p["title"], p["category"], p["price"], p["original_price"],
                p["rating"], p["reviews_count"], p["stock"], p["image_url"],
                p["description"], p["specs_json"], p["badge"], p["featured"]
            ))

        conn.commit()

# Session Management
def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(days=30)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
    """, (token, user_id, expires_at.isoformat()))
    conn.commit()
    conn.close()
    return token

def get_user_by_session(token: str):
    if not token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT u.id, u.name, u.email, u.role, u.address, u.phone, u.created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
    """, (token, datetime.now().isoformat()))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def delete_session(token: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_FILE)
