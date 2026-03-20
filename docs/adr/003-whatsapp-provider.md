# ADR-003: WhatsApp Provider Selection

**Status:** Accepted (migrated from Twilio to Meta Cloud API, March 2026)
**Date:** March 2026

---

## Context

Qboard sends two categories of WhatsApp messages:

1. **Roster images** — daily branded PNG showing each worker's dogs, sent to the business owner and staff at 4am, 7am, 8:30am, and Friday 3pm PDT
2. **Operational alerts** — text messages for integration check reports, cron failure notices, Gmail monitor alerts

These messages were originally sent via Twilio. As of v5.0, roster images use Meta Cloud API directly. Alert messages continue to use Twilio.

---

## Original choice: Twilio

Twilio was the starting point for a reasonable set of reasons:

- Well-documented Node.js SDK
- Easy sandbox setup for development
- Familiar to most developers
- Handles both WhatsApp and SMS with a single provider

### The problem that emerged: sandbox limitations

Twilio's WhatsApp sandbox requires pre-approval for every recipient number. Anyone whose number isn't pre-approved cannot receive a message. This has a direct business impact:

- A real client cannot receive notifications until they jump through the sandbox approval process
- Adding a second recipient requires another approval step
- Demoing the system to anyone not pre-approved is impossible

The Twilio production path (moving off sandbox to a registered WhatsApp Business account) is possible but expensive for a small operation and requires Meta Business verification regardless — because Twilio itself is a WhatsApp Business Solution Provider on top of Meta's infrastructure.

---

## Options considered

### Option A: Stay on Twilio, move to production sender
Register a Twilio WhatsApp Business account, go through Meta's business verification, pay Twilio's per-message fees plus the WhatsApp conversation fee.

**Rejected because:** we'd be paying Twilio as an intermediary to use Meta's API. The underlying API is Meta's either way.

### Option B: Migrate to Meta Cloud API directly
Register a Meta app, create a WhatsApp Business account, use the Meta Graph API directly. Free for the first 1,000 business-initiated conversations per month.

**Adopted for roster images.** This removes the sandbox restriction entirely — any phone number can receive messages without pre-approval. No per-message fees at our volume.

### Option C: Alternative providers (MessageBird, 360dialog, etc.)
Other WhatsApp Business Solution Providers exist but add the same intermediary cost as Twilio without the familiarity benefit.

**Rejected** — no advantage over Option A or B.

---

## Decision

**Hybrid: Meta Cloud API for roster images, Twilio for operational alerts.**

The split is deliberate:

**Meta Cloud API** handles roster images because:
- Direct API, no intermediary fees
- No sandbox recipient restriction — any number can receive
- The system user token is permanent (no 24h expiry like the app-level token)
- Image messages (with a `link` payload) are natively supported

**Twilio** continues to handle operational alerts (integration check, cron health, Gmail monitor) because:
- These alerts already work correctly
- Alert recipients are fixed operator numbers (not subject to the sandbox problem)
- Migrating alert infrastructure mid-project would be change for no gain

### What "no sandbox restriction" actually means

In production, Meta's WhatsApp Business API requires recipients to either:
1. Have previously messaged the business (opens a 24h free-form window), or
2. Receive an approved message template

For the roster use case, all recipients are known and can be sent an initial template to open the conversation. Day-over-day, the morning 4am send always fires (no hash check), which maintains an active conversation window for the 7am and 8:30am sends.

---

## Token management

Meta has two token types:

| Type | Expiry | Use case |
|---|---|---|
| App-level token (shown on API Setup page) | 24 hours | Testing only |
| System user token | Configurable (set to Never) | Production |

The system user must be assigned to both the Meta app AND the WhatsApp Business Account with `Full control` permissions. A system user assigned only to the app will have API calls accepted (200 OK with a messageId) but messages silently fail to deliver — a particularly insidious failure mode.

---

## Consequences

- Roster images can be sent to any phone number without pre-approval
- Monthly cost for notifications: $0 (under 1,000 conversations/month threshold)
- Two providers to manage (Meta + Twilio) — acceptable given the different use cases
- Meta token rotation: system user tokens are set to never expire; if rotation becomes a compliance requirement, the system user dashboard handles it
- DST note: this ADR has no DST dependency; both providers accept UTC timestamps
