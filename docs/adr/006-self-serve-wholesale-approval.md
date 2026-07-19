# ADR-006: Self-Serve Wholesale Approval Flow

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** Wholesale accounts need vetting, but small-scale operators can't wait for complex approval flows.

**Decision:**
- Registration form collects `company_name` + `tax_registration_id` (optional for retail)
- If a user provides these fields, their role is set to `wholesale_pending`
- If they skip them, role is `retail` (default)
- Admin dashboard shows a "Pending Approvals" section with approve/reject buttons
- No email notification at MVP — admin checks dashboard periodically

**Consequences:**
- Low friction for users who want wholesale
- Manual review prevents abuse
- Can add email/webhook notifications later
