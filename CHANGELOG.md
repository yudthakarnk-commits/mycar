# MYCAR v3.0 — 2026-11-18

- Add vehicle reference-photo picker (Wikimedia Commons) and local car photo upload displayed in Summary; synced with existing per-user Supabase vehicle row.
- Migrate legacy VQG8991 fuel grade to RON95 for matching records only, without changing financial fields.
- Separate latest recorded odometer from sum of recorded trip distances on Summary.
- Prefill new trip starting odometer using prior trip by date; preserve manual edits.
- Add client-side, password-enabled TNG eWallet PDF parser with duplicate preview and import for toll/parking; do not store password or upload PDF.
- Replace changing header "Synced" text badge with fixed-size colored dot, preserving detailed sync status in Settings.
- Bump service worker shell cache to v6.

This version does not require new database tables or a Supabase SQL migration.

## v3.1.0 — vehicle hero cutout + Android PWA refresh
- Replace default full-scene Corolla Cross reference image with an original generated transparent 3/4 view illustration (not the owner's exact vehicle).
- Place compact car cutout on right side of total-expense amount; retain text and mileage panel, compact photo attribution for Wikimedia alternatives.
- Keep original Wikimedia selection available in photo picker and preserve custom user photos. No Supabase data migration or SQL changes.
- Bump service-worker cache, load online assets network-first, update registration on foreground, and reload once when a new worker controls the app. Scope cleanup to MYCAR caches only.
- Use versioned app asset URLs to recover from previously cached CSS/JS mismatch.
