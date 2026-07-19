# ADR-004: Auth-Required Receipt Pages with Dual Access

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** Order receipts contain PII (customer name, phone, ordered items). Need to balance merchant convenience with privacy.

**Decision:**
- All receipt pages (`/receipts/[id]`) require authentication
- **Order owner** (matching `user_id`) can view their own receipt
- **Admin** users can view any receipt
- The WhatsApp deep link includes the order ID, but the recipient must log in to view details
- Merchant logs into their admin dashboard to see all orders

**Consequences:**
- Protects customer data
- Slightly friction for merchant viewing via WhatsApp link, but acceptable for small-scale operators
- Can add shareable "public view" links later if needed
