"""
OmniMart Automated Integration Tests
Validates all REST endpoints, persistent auth, payments, cart, and admin operations.
"""

import sys
import json
import urllib.request
import urllib.error
import threading
import time
import os

import database
from server import OmniMartHandler, PORT
from http.server import ThreadingHTTPServer

BASE_URL = f"http://127.0.0.1:{PORT}"

def make_request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            return resp.status, json.loads(resp_body) if resp_body else {}
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(resp_body)
        except Exception:
            return e.code, {"error": resp_body}

def run_tests():
    print("==================================================")
    print(" Running OmniMart Full-Stack API Integration Tests ")
    print("==================================================")

    # 1. Test Products API
    status, res = make_request("/api/products")
    assert status == 200, f"Expected 200, got {status}"
    assert "products" in res and len(res["products"]) >= 20, "Products count mismatch"
    print(f"  [PASS] Catalog Listing: Retrieved {len(res['products'])} products.")

    # 2. Test Category API & Filtering
    status, res = make_request("/api/categories")
    assert status == 200, f"Expected 200, got {status}"
    assert len(res["categories"]) >= 5, "Categories count mismatch"
    print(f"  [PASS] Categories: {len(res['categories'])} distinct categories verified.")

    status, res = make_request("/api/products?category=Electronics")
    assert status == 200 and all(p["category"] == "Electronics" for p in res["products"]), "Category filter failed"
    print(f"  [PASS] Category Filter: Filtered {len(res['products'])} Electronics products.")

    # 3. Test Search & Price Filtering
    status, res = make_request("/api/products?search=OLED")
    assert status == 200 and len(res["products"]) >= 1, "Search query failed"
    print(f"  [PASS] Search Filter: Found '{res['products'][0]['title']}'.")

    # 4. Test Customer Authentication (Pre-seeded John Doe)
    status, res = make_request("/api/auth/login", method="POST", data={
        "email": "john@example.com",
        "password": "password123"
    })
    assert status == 200 and res.get("success"), f"Customer login failed: {res}"
    customer_token = res["token"]
    assert customer_token is not None, "Missing session token"
    print("  [PASS] Customer Auth Login: Logged in as John Doe, token issued.")

    # Verify Session persistence
    status, res = make_request("/api/auth/me", token=customer_token)
    assert status == 200 and res.get("user")["email"] == "john@example.com", "Session verification failed"
    print("  [PASS] Persistent Session Check: Token verified user identity.")

    # 5. Test User Registration
    test_email = f"testuser_{int(time.time())}@omnimart.com"
    status, res = make_request("/api/auth/register", method="POST", data={
        "name": "Alex Tester",
        "email": test_email,
        "password": "securepass123",
        "address": "456 Silicon Ave, Tech District",
        "phone": "+1 555-9876"
    })
    assert status == 200 and res.get("success"), f"Registration failed: {res}"
    new_user_token = res["token"]
    print(f"  [PASS] User Registration: Created new account '{test_email}'.")

    # 6. Test Cart Management
    status, res = make_request("/api/cart", method="POST", token=new_user_token, data={
        "product_id": 1,
        "quantity": 2
    })
    assert status == 200, "Add to cart failed"
    status, res = make_request("/api/cart", token=new_user_token)
    assert status == 200 and len(res["items"]) == 1 and res["items"][0]["quantity"] == 2, "Cart item check failed"
    print("  [PASS] Shopping Cart: Added 2 items and verified cart persistence.")

    # 7. Test Order Placement & Multi-Gateway Checkout
    order_data = {
        "customer_name": "Alex Tester",
        "customer_email": test_email,
        "shipping_address": "456 Silicon Ave",
        "payment_method": "CREDIT_CARD",
        "coupon": "WELCOME20",
        "items": [{"id": 1, "quantity": 1}]
    }
    status, res = make_request("/api/orders", method="POST", token=new_user_token, data=order_data)
    assert status == 200 and res.get("success"), f"Order checkout failed: {res}"
    order = res["order"]
    assert order["order_number"].startswith("ORD-"), "Invalid order number format"
    assert order["tracking_number"].startswith("TRK-"), "Invalid tracking number format"
    assert order["discount_amount"] > 0, "Coupon discount not applied"
    print(f"  [PASS] Payment & Order Flow: Order {order['order_number']} placed (Tracking: {order['tracking_number']}).")

    # 8. Test Admin Login & Permissions
    status, res = make_request("/api/auth/login", method="POST", data={
        "email": "admin@omnimart.com",
        "password": "admin123"
    })
    assert status == 200 and res.get("user")["role"] == "admin", "Admin login failed"
    admin_token = res["token"]
    print("  [PASS] Admin Authentication: Admin credentials verified.")

    # 9. Test Admin Stats & Orders
    status, res = make_request("/api/admin/stats", token=admin_token)
    assert status == 200 and res["total_orders"] >= 1, "Admin stats failed"
    print(f"  [PASS] Admin Metrics: Total Revenue: ${res['total_revenue']}, Orders: {res['total_orders']}.")

    status, res = make_request(f"/api/admin/orders/{order['id']}/status", method="PUT", token=admin_token, data={
        "status": "Shipped"
    })
    assert status == 200 and res.get("success"), "Order status update failed"
    print("  [PASS] Admin Order Control: Updated order shipment status to 'Shipped'.")

    print("\n==================================================")
    print(" ALL 9 INTEGRATION TESTS PASSED SUCCESSFULLY! [SUCCESS]")
    print("==================================================")

if __name__ == "__main__":
    # Start server in background thread for testing
    database.init_db()
    server = ThreadingHTTPServer(("", PORT), OmniMartHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(1)

    try:
        run_tests()
    finally:
        server.shutdown()
        server.server_close()
