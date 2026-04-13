# CLAUDE.md — Padel Mono Repo

## Project overview
Padel club management platform: court booking, match management, payments, and player administration.

## Architecture
- **Monorepo** with 4 packages:
  - `backend/` — Express + TypeScript API server (port 3000), Supabase as DB
  - `web-app/` — React (Vite) admin panel for club management
  - `mobile-app/` — React Native app for players
  - `supabase/` — Database migrations and edge functions
  - `docs/` — Documentation

## Key conventions
- **DB column**: The bookings table uses `reservation_type` (not `booking_type`) despite migration 007 naming it `booking_type`. The API accepts `booking_type` in request body and maps it to `reservation_type` on insert.
- **Source channel values**: `mobile`, `web`, `manual`, `system`
- **Booking statuses**: `pending_payment`, `confirmed`, `completed`, `cancelled`, `past`
- **Match competitive field**: boolean (`true`/`false`), not an enum
- **Supabase project**: `padel-app` (ID: `oxowmfhnorxnabhzkcmi`, region: `eu-central-1`)

## Development
```bash
# Backend
cd backend && npm run dev        # Starts on port 3000

# Web app
cd web-app && npm run dev        # Starts on port 5173
```

## Testing
- No test framework configured yet. Functional testing done via curl against running backend.
- Backend type-check: `cd backend && npx tsc --noEmit`
- Web type-check: `cd web-app && npx tsc --noEmit`

## Important patterns
- `getSupabaseServiceRoleClient()` for backend DB access (bypasses RLS)
- Wallet balance = `SUM(amount_cents)` from `wallet_transactions` grouped by `player_id + club_id`
- Manual payments use `stripe_payment_intent_id` prefixed with `manual_` for tracking
- Booking types `blocked` and `tournament` allow `organizer_player_id = NULL`
- Court conflict check excludes only `status='cancelled'` bookings (both `pending_payment` and `confirmed` occupy the grid)

## Considerations
- Don't build the project everytime that I request you a change or fix something. I will tell you when is the proper time to build the project.
