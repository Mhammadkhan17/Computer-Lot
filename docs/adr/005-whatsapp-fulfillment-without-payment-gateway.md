# ADR-005: WhatsApp Fulfillment Model (No Payment Gateway)

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** Traditional e-commerce requires payment gateways. For small-scale liquidators, payment adds complexity and fees.

**Decision:**
- No payment gateway integration
- All orders are fulfilled via WhatsApp Business deep link
- Order status starts at `pending_whatsapp`, never auto-advances
- Admin manually updates status in dashboard: `processing` → `completed` or `cancelled`
- WhatsApp message includes full order summary (items, quantities, total, receipt link)
- Merchant phone is a single config value (`MERCHANT_PHONE` env var)

**Consequences:**
- Zero payment processing fees
- Manual fulfillment workflow (acceptable for small-scale operators)
- Order status is best-effort (admin-managed)
- Easy to add a payment gateway later if needed
