# ADR-008: For_Parts Grade Visibility

**Status:** Accepted  
**Date:** 2026-07-18  
**Context:** Products graded "For_Parts" are damaged/non-functional. Need to decide visibility and selling rules.

**Decision:**
- Visible to ALL users (retail and wholesale)
- Displayed with a distinct "As-Is / For Parts" badge
- Normal pricing rules apply (same as other grades)
- Return policy noted in `product.description` — not enforced in code at MVP

**Consequences:**
- Maximizes inventory exposure (good for liquidation)
- Clear visual warning prevents misunderstandings
- Keeps code simple (no grade-based branching in pricing logic)
