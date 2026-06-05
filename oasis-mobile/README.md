# Scout Mobile

Native iOS/Android app for [Scout](https://github.com/sahil-red/oasis2) — honest grocery scores and Ask Scout AI.

Built with **Expo Router** (React Native). No WebView: native screens, product grid, PDP, AI search, basket, and Razorpay subscriptions (UPI + card mandate).

## Setup

1. **Install dependencies**

   ```bash
   cd oasis-mobile
   pnpm install
   ```

2. **Environment** — copy `.env.example` to `.env`:

   ```bash
   EXPO_PUBLIC_API_URL=https://your-deployed-scout.vercel.app
   EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

3. **Backend** (parent `oasis2` repo):

   - Run migration: `pnpm db:migrate` (includes `0010_profiles_billing.sql`)
   - Set Razorpay keys on the **web** deployment:
     - `RAZORPAY_KEY_ID`
     - `RAZORPAY_KEY_SECRET`
     - `RAZORPAY_WEBHOOK_SECRET`
     - Optional `RAZORPAY_PLAN_ID` (or let the API create a plan once)
   - Configure Supabase Auth: Google, Apple, Phone providers
   - Add redirect URL: `scout://` (mobile) and your site URL for OAuth

4. **Replace placeholder icons** in `assets/` before App Store submission (1024×1024 `icon.png`).

## Run

```bash
pnpm start
# i — iOS simulator
# a — Android emulator
```

For device builds:

```bash
pnpm ios    # requires Xcode
pnpm android
```

## Architecture

| Screen | API |
|--------|-----|
| Home | `GET /api/landing` |
| Browse | `GET /api/catalog/search` |
| Ask Scout | `POST /api/search/ai` (auth + daily quota) |
| Product | `GET /api/products/[slug]` |
| Basket | `GET /api/products?slugs=` |
| Subscribe | `POST /api/billing/create-subscription` → Razorpay checkout |

Auth: Supabase (Google, Apple, phone OTP). Billing: Razorpay recurring subscription (India).

## App Store

- Bundle ID: `app.scout.grocery` (change in `app.json` if needed)
- Enable **Sign in with Apple** if Google sign-in is offered
- Privacy policy + account deletion flow required
- In-app subscription must use Razorpay checkout that complies with Apple guidelines for external payment in India (review current App Store rules for your region)
