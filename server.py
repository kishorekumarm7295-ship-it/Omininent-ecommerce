"""
OmniMart Full-Stack E-Commerce Server
Zero-dependency Python HTTP Server implementing full REST API and Static File Serving.
"""

import sys
import os
import json
import sqlite3
import mimetypes
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from datetime import datetime
import secrets

import database
from database import get_db, hash_password, verify_password, create_session, get_user_by_session, delete_session

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

class OmniMartHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    # --- Header Helpers ---
    def set_json_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def get_auth_user(self):
        auth_header = self.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        elif "Cookie" in self.headers:
            cookies = self.headers["Cookie"].split(";")
            for c in cookies:
                if "session_token=" in c:
                    token = c.split("session_token=")[1].strip()
                    break
        if not token:
            return None
        return get_user_by_session(token)

    def read_json_body(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len == 0:
            return {}
        raw = self.rfile.read(content_len)
        try:
            return json.loads(raw.decode('utf-8'))
        except Exception:
            return {}

    def send_json(self, data, status=200):
        self.set_json_headers(status)
        self.wfile.write(json.dumps(data, default=str).encode('utf-8'))

    def send_error_json(self, message, status=400):
        self.send_json({"error": message, "success": False}, status=status)

    # --- HTTP Routing ---
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # API Routes
        if path.startswith("/api/"):
            self.handle_api_get(path, query)
            return

        # Serve SPA Index for root or unhandled static paths
        if path == "/" or path == "":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            self.handle_api_post(path)
            return
        self.send_error_json("Not Found", 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            self.handle_api_put(path)
            return
        self.send_error_json("Not Found", 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            self.handle_api_delete(path)
            return
        self.send_error_json("Not Found", 404)

    # --- API Handlers: GET ---
    def handle_api_get(self, path, query):
        conn = get_db()
        cursor = conn.cursor()

        try:
            # 1. Auth Me
            if path == "/api/auth/me":
                user = self.get_auth_user()
                if user:
                    self.send_json({"success": True, "user": user})
                else:
                    self.send_json({"success": False, "user": None})
                return

            # 2. Categories List
            if path == "/api/categories":
                cursor.execute("""
                SELECT category, COUNT(*) as count 
                FROM products 
                GROUP BY category 
                ORDER BY count DESC
                """)
                rows = cursor.fetchall()
                categories = [{"name": r["category"], "count": r["count"]} for r in rows]
                self.send_json({"categories": categories})
                return

            # 3. Products List & Search
            if path == "/api/products":
                category = query.get("category", [None])[0]
                search = query.get("search", [None])[0]
                min_price = query.get("min_price", [None])[0]
                max_price = query.get("max_price", [None])[0]
                min_rating = query.get("min_rating", [None])[0]
                sort = query.get("sort", ["featured"])[0]
                featured = query.get("featured", [None])[0]

                sql = "SELECT * FROM products WHERE 1=1"
                params = []

                if category and category != "All":
                    sql += " AND category = ?"
                    params.append(category)

                if search:
                    sql += " AND (title LIKE ? OR description LIKE ? OR category LIKE ?)"
                    wildcard = f"%{search.strip()}%"
                    params.extend([wildcard, wildcard, wildcard])

                if min_price:
                    try:
                        sql += " AND price >= ?"
                        params.append(float(min_price))
                    except ValueError:
                        pass

                if max_price:
                    try:
                        sql += " AND price <= ?"
                        params.append(float(max_price))
                    except ValueError:
                        pass

                if min_rating:
                    try:
                        sql += " AND rating >= ?"
                        params.append(float(min_rating))
                    except ValueError:
                        pass

                if featured == "1":
                    sql += " AND featured = 1"

                # Sorting
                if sort == "price_asc":
                    sql += " ORDER BY price ASC"
                elif sort == "price_desc":
                    sql += " ORDER BY price DESC"
                elif sort == "rating":
                    sql += " ORDER BY rating DESC"
                elif sort == "popular":
                    sql += " ORDER BY reviews_count DESC"
                else:
                    sql += " ORDER BY featured DESC, id ASC"

                cursor.execute(sql, params)
                products = [dict(row) for row in cursor.fetchall()]
                # Parse specs_json
                for p in products:
                    try:
                        p["specs"] = json.loads(p.get("specs_json") or "{}")
                    except Exception:
                        p["specs"] = {}

                self.send_json({"products": products, "total": len(products)})
                return

            # 4. Single Product Details
            if path.startswith("/api/products/"):
                prod_id = path.split("/")[-1]
                cursor.execute("SELECT * FROM products WHERE id = ?", (prod_id,))
                prod = cursor.fetchone()
                if prod:
                    data = dict(prod)
                    try:
                        data["specs"] = json.loads(data.get("specs_json") or "{}")
                    except Exception:
                        data["specs"] = {}
                    self.send_json({"product": data})
                else:
                    self.send_error_json("Product not found", 404)
                return

            # 5. User Cart
            if path == "/api/cart":
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                cursor.execute("""
                SELECT c.quantity, p.id, p.title, p.category, p.price, p.original_price, p.stock, p.image_url, p.badge
                FROM cart_items c
                JOIN products p ON c.product_id = p.id
                WHERE c.user_id = ?
                """, (user["id"],))
                items = [dict(row) for row in cursor.fetchall()]
                self.send_json({"items": items})
                return

            # 6. User Wishlist
            if path == "/api/wishlist":
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                cursor.execute("""
                SELECT p.id, p.title, p.category, p.price, p.original_price, p.rating, p.reviews_count, p.stock, p.image_url, p.badge
                FROM wishlist_items w
                JOIN products p ON w.product_id = p.id
                WHERE w.user_id = ?
                """, (user["id"],))
                items = [dict(row) for row in cursor.fetchall()]
                self.send_json({"items": items})
                return

            # 7. User Orders History
            if path == "/api/orders":
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                cursor.execute("""
                SELECT * FROM orders 
                WHERE user_id = ? 
                ORDER BY created_at DESC
                """, (user["id"],))
                orders = [dict(row) for row in cursor.fetchall()]
                # Load items for each order
                for ord in orders:
                    cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (ord["id"],))
                    ord["items"] = [dict(i) for i in cursor.fetchall()]
                self.send_json({"orders": orders})
                return

            # 8. Single Order Details
            if path.startswith("/api/orders/"):
                ord_id = path.split("/")[-1]
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                if user["role"] == "admin":
                    cursor.execute("SELECT * FROM orders WHERE id = ? OR order_number = ?", (ord_id, ord_id))
                else:
                    cursor.execute("SELECT * FROM orders WHERE (id = ? OR order_number = ?) AND user_id = ?", (ord_id, ord_id, user["id"]))
                order_row = cursor.fetchone()
                if order_row:
                    order = dict(order_row)
                    cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (order["id"],))
                    order["items"] = [dict(i) for i in cursor.fetchall()]
                    self.send_json({"order": order})
                else:
                    self.send_error_json("Order not found", 404)
                return

            # 9. Admin Stats
            if path == "/api/admin/stats":
                user = self.get_auth_user()
                if not user or user["role"] != "admin":
                    self.send_error_json("Admin access required", 403)
                    return
                cursor.execute("SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders")
                total_orders, total_revenue = cursor.fetchone()
                cursor.execute("SELECT COUNT(*) FROM users")
                total_users = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM products")
                total_products = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM products WHERE stock <= 10")
                low_stock_count = cursor.fetchone()[0]

                # Recent orders
                cursor.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5")
                recent_orders = [dict(r) for r in cursor.fetchall()]

                self.send_json({
                    "total_revenue": round(total_revenue, 2),
                    "total_orders": total_orders,
                    "total_users": total_users,
                    "total_products": total_products,
                    "low_stock_count": low_stock_count,
                    "recent_orders": recent_orders
                })
                return

            # 10. Admin Orders List
            if path == "/api/admin/orders":
                user = self.get_auth_user()
                if not user or user["role"] != "admin":
                    self.send_error_json("Admin access required", 403)
                    return
                cursor.execute("SELECT * FROM orders ORDER BY created_at DESC")
                orders = [dict(row) for row in cursor.fetchall()]
                for ord in orders:
                    cursor.execute("SELECT * FROM order_items WHERE order_id = ?", (ord["id"],))
                    ord["items"] = [dict(i) for i in cursor.fetchall()]
                self.send_json({"orders": orders})
                return

            self.send_error_json("API endpoint not found", 404)
        finally:
            conn.close()

    # --- API Handlers: POST ---
    def handle_api_post(self, path):
        conn = get_db()
        cursor = conn.cursor()
        body = self.read_json_body()

        try:
            # 1. Register
            if path == "/api/auth/register":
                name = body.get("name", "").strip()
                email = body.get("email", "").strip().lower()
                password = body.get("password", "")
                address = body.get("address", "").strip()
                phone = body.get("phone", "").strip()

                if not name or not email or not password:
                    self.send_error_json("Name, email, and password are required")
                    return

                cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
                if cursor.fetchone():
                    self.send_error_json("An account with this email already exists")
                    return

                pwd_hash, salt = hash_password(password)
                cursor.execute("""
                INSERT INTO users (name, email, password_hash, salt, role, address, phone)
                VALUES (?, ?, ?, ?, 'customer', ?, ?)
                """, (name, email, pwd_hash, salt, address, phone))
                user_id = cursor.lastrowid
                conn.commit()

                token = create_session(user_id)
                self.send_json({
                    "success": True,
                    "message": "Account created successfully!",
                    "token": token,
                    "user": {
                        "id": user_id,
                        "name": name,
                        "email": email,
                        "role": "customer",
                        "address": address,
                        "phone": phone
                    }
                })
                return

            # 2. Login
            if path == "/api/auth/login":
                email = body.get("email", "").strip().lower()
                password = body.get("password", "")

                cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
                row = cursor.fetchone()
                if not row or not verify_password(row["password_hash"], row["salt"], password):
                    self.send_error_json("Invalid email or password", 401)
                    return

                token = create_session(row["id"])
                self.send_json({
                    "success": True,
                    "message": "Login successful!",
                    "token": token,
                    "user": {
                        "id": row["id"],
                        "name": row["name"],
                        "email": row["email"],
                        "role": row["role"],
                        "address": row["address"],
                        "phone": row["phone"]
                    }
                })
                return

            # 3. Logout
            if path == "/api/auth/logout":
                auth_header = self.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header.split(" ", 1)[1].strip()
                    delete_session(token)
                self.send_json({"success": True, "message": "Logged out successfully"})
                return

            # 4. Cart Add / Update
            if path == "/api/cart":
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                product_id = body.get("product_id")
                quantity = int(body.get("quantity", 1))

                if quantity <= 0:
                    cursor.execute("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", (user["id"], product_id))
                else:
                    cursor.execute("""
                    INSERT INTO cart_items (user_id, product_id, quantity)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = ?
                    """, (user["id"], product_id, quantity, quantity))
                conn.commit()
                self.send_json({"success": True})
                return

            # 5. Cart Sync (Merge guest cart upon login)
            if path == "/api/cart/sync":
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                items = body.get("items", [])
                for item in items:
                    pid = item.get("id") or item.get("product_id")
                    qty = int(item.get("quantity", 1))
                    cursor.execute("""
                    INSERT INTO cart_items (user_id, product_id, quantity)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + ?
                    """, (user["id"], pid, qty, qty))
                conn.commit()
                self.send_json({"success": True})
                return

            # 6. Wishlist Toggle
            if path == "/api/wishlist":
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                product_id = body.get("product_id")
                cursor.execute("SELECT id FROM wishlist_items WHERE user_id = ? AND product_id = ?", (user["id"], product_id))
                existing = cursor.fetchone()
                if existing:
                    cursor.execute("DELETE FROM wishlist_items WHERE id = ?", (existing["id"],))
                    in_wishlist = False
                else:
                    cursor.execute("INSERT INTO wishlist_items (user_id, product_id) VALUES (?, ?)", (user["id"], product_id))
                    in_wishlist = True
                conn.commit()
                self.send_json({"success": True, "in_wishlist": in_wishlist})
                return

            # 7. Create Order & Process Payment
            if path == "/api/orders":
                user = self.get_auth_user()
                # Guest or authenticated user can checkout
                user_id = user["id"] if user else 1  # Fallback to demo customer if guest
                customer_name = body.get("customer_name") or (user["name"] if user else "Guest Customer")
                customer_email = body.get("customer_email") or (user["email"] if user else "guest@omnimart.com")
                customer_phone = body.get("customer_phone") or (user["phone"] if user else "")
                shipping_address = body.get("shipping_address", "Standard Shipping Address")
                payment_method = body.get("payment_method", "Credit Card")
                items = body.get("items", [])
                coupon = body.get("coupon", "").upper()

                if not items:
                    self.send_error_json("Cart is empty")
                    return

                # Calculate subtotal and verify stock
                subtotal = 0.0
                order_items_to_save = []
                for item in items:
                    pid = item["id"]
                    qty = int(item["quantity"])
                    cursor.execute("SELECT * FROM products WHERE id = ?", (pid,))
                    prod = cursor.fetchone()
                    if not prod:
                        self.send_error_json(f"Product {pid} not found")
                        return
                    if prod["stock"] < qty:
                        self.send_error_json(f"Insufficient stock for '{prod['title']}' (Only {prod['stock']} available)")
                        return
                    
                    item_total = prod["price"] * qty
                    subtotal += item_total
                    order_items_to_save.append({
                        "product_id": prod["id"],
                        "product_title": prod["title"],
                        "price": prod["price"],
                        "quantity": qty,
                        "image_url": prod["image_url"]
                    })

                # Calculate discounts & totals
                discount = 0.0
                if coupon == "WELCOME20":
                    discount = subtotal * 0.20
                elif coupon == "MEGA50":
                    discount = min(50.0, subtotal * 0.30)
                elif coupon == "FREESHIP":
                    discount = 0.0

                shipping_fee = 0.0 if (subtotal >= 100 or coupon == "FREESHIP") else 9.99
                tax_amount = round((subtotal - discount) * 0.08, 2)  # 8% Tax
                total_amount = round(subtotal - discount + shipping_fee + tax_amount, 2)

                order_number = f"ORD-{secrets.token_hex(4).upper()}"
                tracking_number = f"TRK-{secrets.token_hex(6).upper()}"

                cursor.execute("""
                INSERT INTO orders (
                    order_number, user_id, total_amount, subtotal, discount_amount,
                    shipping_fee, tax_amount, payment_method, payment_status,
                    shipping_address, customer_name, customer_email, customer_phone,
                    order_status, tracking_number
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Paid', ?, ?, ?, ?, 'Confirmed', ?)
                """, (
                    order_number, user_id, total_amount, subtotal, discount,
                    shipping_fee, tax_amount, payment_method,
                    shipping_address, customer_name, customer_email, customer_phone,
                    tracking_number
                ))
                order_id = cursor.lastrowid

                # Save items & decrement stock
                for oi in order_items_to_save:
                    cursor.execute("""
                    INSERT INTO order_items (order_id, product_id, product_title, price, quantity, image_url)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, (order_id, oi["product_id"], oi["product_title"], oi["price"], oi["quantity"], oi["image_url"]))
                    
                    cursor.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (oi["quantity"], oi["product_id"]))

                # Clear cart if authenticated
                if user:
                    cursor.execute("DELETE FROM cart_items WHERE user_id = ?", (user["id"],))

                conn.commit()

                self.send_json({
                    "success": True,
                    "message": "Payment successful and order placed!",
                    "order": {
                        "id": order_id,
                        "order_number": order_number,
                        "tracking_number": tracking_number,
                        "total_amount": total_amount,
                        "subtotal": round(subtotal, 2),
                        "discount_amount": round(discount, 2),
                        "shipping_fee": shipping_fee,
                        "tax_amount": tax_amount,
                        "payment_method": payment_method,
                        "order_status": "Confirmed",
                        "shipping_address": shipping_address,
                        "customer_name": customer_name,
                        "customer_email": customer_email,
                        "items": order_items_to_save,
                        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                })
                return

            # 8. Admin: Create Product
            if path == "/api/products":
                user = self.get_auth_user()
                if not user or user["role"] != "admin":
                    self.send_error_json("Admin privileges required", 403)
                    return

                title = body.get("title", "").strip()
                category = body.get("category", "Electronics")
                price = float(body.get("price", 0))
                original_price = float(body.get("original_price", price))
                stock = int(body.get("stock", 10))
                image_url = body.get("image_url", "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800")
                description = body.get("description", "")
                specs_json = json.dumps(body.get("specs", {}))
                badge = body.get("badge", "")
                featured = 1 if body.get("featured") else 0

                cursor.execute("""
                INSERT INTO products (title, category, price, original_price, rating, reviews_count, stock, image_url, description, specs_json, badge, featured)
                VALUES (?, ?, ?, ?, 5.0, 1, ?, ?, ?, ?, ?, ?)
                """, (title, category, price, original_price, stock, image_url, description, specs_json, badge, featured))
                new_id = cursor.lastrowid
                conn.commit()

                self.send_json({"success": True, "product_id": new_id, "message": "Product created successfully"})
                return

            self.send_error_json("API endpoint not found", 404)
        finally:
            conn.close()

    # --- API Handlers: PUT ---
    def handle_api_put(self, path):
        conn = get_db()
        cursor = conn.cursor()
        body = self.read_json_body()

        try:
            # 1. Admin: Update Product
            if path.startswith("/api/products/"):
                prod_id = path.split("/")[-1]
                user = self.get_auth_user()
                if not user or user["role"] != "admin":
                    self.send_error_json("Admin privileges required", 403)
                    return

                cursor.execute("SELECT * FROM products WHERE id = ?", (prod_id,))
                if not cursor.fetchone():
                    self.send_error_json("Product not found", 404)
                    return

                title = body.get("title")
                category = body.get("category")
                price = body.get("price")
                original_price = body.get("original_price")
                stock = body.get("stock")
                image_url = body.get("image_url")
                description = body.get("description")
                badge = body.get("badge")
                featured = 1 if body.get("featured") else 0

                cursor.execute("""
                UPDATE products SET
                    title = COALESCE(?, title),
                    category = COALESCE(?, category),
                    price = COALESCE(?, price),
                    original_price = COALESCE(?, original_price),
                    stock = COALESCE(?, stock),
                    image_url = COALESCE(?, image_url),
                    description = COALESCE(?, description),
                    badge = COALESCE(?, badge),
                    featured = ?
                WHERE id = ?
                """, (title, category, price, original_price, stock, image_url, description, badge, featured, prod_id))
                conn.commit()
                self.send_json({"success": True, "message": "Product updated successfully"})
                return

            # 2. Admin: Update Order Status
            if path.startswith("/api/admin/orders/") and path.endswith("/status"):
                parts = path.split("/")
                order_id = parts[4]
                user = self.get_auth_user()
                if not user or user["role"] != "admin":
                    self.send_error_json("Admin privileges required", 403)
                    return

                new_status = body.get("status")
                if not new_status:
                    self.send_error_json("Status is required")
                    return

                cursor.execute("UPDATE orders SET order_status = ? WHERE id = ?", (new_status, order_id))
                conn.commit()
                self.send_json({"success": True, "message": f"Order status updated to {new_status}"})
                return

            self.send_error_json("API endpoint not found", 404)
        finally:
            conn.close()

    # --- API Handlers: DELETE ---
    def handle_api_delete(self, path):
        conn = get_db()
        cursor = conn.cursor()

        try:
            # 1. Clear or Remove Cart Item
            if path == "/api/cart":
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                cursor.execute("DELETE FROM cart_items WHERE user_id = ?", (user["id"],))
                conn.commit()
                self.send_json({"success": True})
                return

            if path.startswith("/api/cart/"):
                prod_id = path.split("/")[-1]
                user = self.get_auth_user()
                if not user:
                    self.send_error_json("Unauthorized", 401)
                    return
                cursor.execute("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", (user["id"], prod_id))
                conn.commit()
                self.send_json({"success": True})
                return

            # 2. Admin: Delete Product
            if path.startswith("/api/products/"):
                prod_id = path.split("/")[-1]
                user = self.get_auth_user()
                if not user or user["role"] != "admin":
                    self.send_error_json("Admin privileges required", 403)
                    return
                cursor.execute("DELETE FROM products WHERE id = ?", (prod_id,))
                conn.commit()
                self.send_json({"success": True, "message": "Product deleted successfully"})
                return

            self.send_error_json("API endpoint not found", 404)
        finally:
            conn.close()

def run_server():
    database.init_db()
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, OmniMartHandler)
    print(f"============================================================")
    print(f"  OmniMart Full-Stack E-Commerce Server Running!          ")
    print(f"  URL: http://127.0.0.1:{PORT}                              ")
    print(f"  Demo Customer: john@example.com / password123             ")
    print(f"  Demo Admin:    admin@omnimart.com / admin123             ")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer shutting down gracefully.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
