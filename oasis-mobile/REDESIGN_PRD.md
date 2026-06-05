# Scout Mobile — Premium Redesign PRD

**Owner:** (you)
**Executor:** Claude Sonnet
**Status:** Ready to execute
**Goal:** Bring the Expo app to the same premium, editorial feel as the web app. The web is the benchmark. Today the app is functionally complete but visually flat, static, and generic. This PRD closes that gap.

---

## 0. Diagnosis — why it currently feels "basic"

The app already has the right bones: it shares the web's exact color tokens, the same fonts (Inter + Instrument Serif), a working light/dark theme context, and componentised screens. The problem is **not** tokens or data. It is:

1. **Zero motion.** `react-native-reanimated@4.1.7` + `react-native-worklets` are installed but **never used**. Nothing animates — no entrance transitions, no press feedback beyond opacity, no shared-element feel, no scroll-driven effects. The web has a marquee, hover-lift, scale-on-press, and smooth transitions everywhere. This is the single biggest gap.
2. **No depth or layering.** Flat panels on flat backgrounds. `expo-linear-gradient` is barely used; `expo-blur` isn't installed. The web uses backdrop-blur nav, gradient fades on the marquee, gradient verdict cards, and hairline dividers.
3. **Generic chrome.** Plain text headers instead of the web's editorial hero (big serif display + italic accent phrase). Default Ionicons tab bar with no polish. Plain `ActivityIndicator` spinners instead of shimmer skeletons.
4. **Missing signature elements.** No marquee product showcase, no "photo-frame" image treatment, no hairline dividers, no glass surfaces.
5. **Typography under-leveraged.** Instrument Serif is used but timidly. The web leans into it: huge display sizes, tight tracking, italic accent spans in the accent color.

**Principle for this redesign:** keep all data wiring, navigation, and business logic exactly as-is. This is a **skin + motion** pass. Do not refactor API calls, auth, basket logic, or routing.

---

## 1. Design principles (the bar)

- **Editorial, not app-y.** Big serif headlines, generous whitespace, italic accent phrases. It should feel like a beautifully typeset magazine that happens to be interactive.
- **Motion is the product.** Every screen entrance, list item, press, and tab change should have intentional, fast, spring-based motion. Subtle but always present. Target 200–400ms, spring physics, never linear-feeling.
- **Depth through layering.** Glass/blur on floating chrome, soft gradients on hero surfaces, hairline dividers, the photo-frame treatment on every product image.
- **Calm, confident color.** Lean on the verdict/score color system for meaning; keep everything else monochrome + accent. Never decorate for decoration's sake.
- **60fps always.** All animation runs on the UI thread via Reanimated worklets. No JS-driven `Animated` API.

---

## 2. Foundations to build first (Phase 1)

These are shared primitives every screen depends on. Build and verify these before touching screens.

### 2.1 Install missing deps
```bash
cd oasis-mobile
npx expo install expo-blur
```
`reanimated`, `worklets`, `gesture-handler`, `linear-gradient` are already present. Confirm `react-native-reanimated/plugin` is the **last** entry in `babel.config.js` plugins — if missing, add it (animations silently fail without it).

### 2.2 Motion system — `src/theme/motion.ts` (new)
Create a single source of truth for animation so every component feels consistent.
```ts
import { Easing } from "react-native-reanimated";

export const motion = {
  // Spring presets (use with withSpring)
  spring: {        damping: 18, stiffness: 180, mass: 1 },       // default UI
  springSoft: {    damping: 22, stiffness: 120, mass: 1 },       // large surfaces
  springSnappy: {  damping: 16, stiffness: 260, mass: 0.8 },     // press feedback
  // Timing presets (use with withTiming)
  timing:     { duration: 280, easing: Easing.out(Easing.cubic) },
  timingFast: { duration: 160, easing: Easing.out(Easing.cubic) },
  // Stagger step for list entrances (ms per item, cap the index ~8)
  stagger: 45,
} as const;
```

### 2.3 Reusable animation primitives — `src/components/motion/` (new)
- **`FadeInUp.tsx`** — wraps children, animates `opacity 0→1` + `translateY 12→0` on mount using `motion.timing`. Accepts a `delay` prop (used for stagger). Use `entering` from Reanimated layout animations OR a `useEffect` + shared values; prefer Reanimated `FadeInDown`/custom for reliability on Expo 54 / RN 0.81. Verify on device.
- **`PressableScale.tsx`** — drop-in `Pressable` replacement. On `pressIn` scale to `0.97` with `springSnappy`; on `pressOut` back to `1`. Optional `haptic` prop → triggers `Haptics.impactAsync(Light)` on press. This replaces the manual `pressed && {opacity}` pattern everywhere.
- **`Skeleton.tsx`** — shimmer placeholder. A view with `bgSoft` background and a translating gradient overlay (`expo-linear-gradient`) animating left→right on a loop (~1.2s). Props: `width`, `height`, `radius`. Build a few composed skeletons (card, row, hero) as named exports.

### 2.4 Surface primitives — extend `src/components/ui/`
- **`GlassView.tsx`** (new) — wraps `expo-blur`'s `BlurView` with `tint` derived from `useTheme().isDark` (`"dark"` | `"light"`), `intensity={40}`, plus a semi-transparent panel overlay + hairline border. Used for the floating nav header and the sticky PDP CTA bar.
- **`Hairline.tsx`** (new) — a 1px view with a horizontal gradient (`transparent → lineStrong → transparent`) via `expo-linear-gradient`. Mirrors the web `.hairline`. Replace plain `borderBottom` dividers on section breaks.
- **`PhotoFrame.tsx`** (new) — standard product-image container: `bgSoft` background, `radius.xl`, `overflow: hidden`, optional top accent border (2px in the product's verdict color), and an internal padded `expo-image`. Every product image across the app routes through this so the treatment is uniform. Include the press-lift (translateY -2 + scale 1.02) when used inside a `PressableScale`.

### 2.5 Typography polish — extend `src/components/ui/Typography.tsx`
Add an editorial hero component matching the web's "We read the back label *so you don't have to*." pattern:
- **`DisplayHero`** — renders Instrument Serif at 40–44px, lineHeight ~0.98, letterSpacing -0.8, with support for an **italic accent span** in `colors.accent` (pass `accent` prop or children with an `<AccentText>` inline). This is the signature typographic move; use it on Ask + Browse + empty states.
- Keep existing `Eyebrow`, `SectionTitle`, `Title` but audit sizes against web: eyebrows `11px / tracking 2.4 / uppercase / fgDim`, section titles serif `26–28px`.

### 2.6 Score & verdict visual upgrade
The web's `ScoreBadge` is `rounded-[10px]`, `font-display 22px bold`, white text, `shadow-lg`, filled with the tier color. Audit `src/components/ScoreBadge.tsx` and `VerdictPill.tsx` against web `verdict-display.ts` values (provided in §6). Verdict chips: `rounded-full`, transparent bg, colored border + colored text, `text-[10–11px] font-semibold`. Make sure both light & dark use the right `--score-*` values (mobile theme already has them).

---

## 3. Screen-by-screen specs (Phase 2+)

> For every screen: wrap the scroll content sections in `FadeInUp` with staggered delays; replace every `Pressable` card/button with `PressableScale`; replace every `ActivityIndicator` full-screen/section loader with the matching `Skeleton`; route every product image through `PhotoFrame`.

### 3.1 Ask tab — `app/(tabs)/index.tsx`  (flagship screen)
This is the first impression. Make it sing.
- **Hero:** Replace the current kicker+text with `DisplayHero`: eyebrow "ASK SCOUT", then big serif "We read the back label **so you don't have to**." (italic accent on the last phrase, accent color). Generous top spacing.
- **Search bar:** Keep `ScoutSearchBar` but give it a subtle focused-state animation (border color + faint accent glow via animated `borderColor`/shadow). On submit, the landing→results transition should **cross-fade** (results `FadeInUp`, landing fades out) rather than a hard swap.
- **Prompt chips:** Animate in with a fast stagger. Press = `PressableScale`.
- **Marquee showcase (NEW — signature element):** Add a horizontally auto-scrolling product strip near the top of the landing state, mirroring the web `home-showcase`. Use a Reanimated `useFrameCallback` or a looped `withTiming` on `translateX` over the duplicated list (~60s full cycle), with `LinearGradient` fade masks on both edges. Pull from `landing.bestInClass` flattened or a dedicated set. Pauses on touch. This alone makes the app feel alive.
- **Landing sections:** Each (`StatsStrip`, `Facts`, `GoalBoards`, `BestInClass`, `DodgeList`) wrapped in `FadeInUp` with increasing delay. Horizontal rails get momentum + snap where natural.
- **Loading:** Replace the spinner with a composed skeleton (hero stat strip placeholder + 2 card-row placeholders).

### 3.2 Search results (inline, within Ask tab)
- Results grid items animate in with stagger (cap delay).
- Summary panel slides/fades in above results.
- Refinement chips: `PressableScale`, animated.
- Back arrow: `PressableScale`. The whole results view enters via cross-fade from landing.
- Empty state: editorial — serif line + muted helper text, not a bare sentence.

### 3.3 Browse tab — `app/(tabs)/browse.tsx`
- Header: eyebrow "CATALOG" + serif `SectionTitle`.
- The "Ask Scout anything…" bar: keep, give it `PressableScale` + a subtle accent left-border or sparkle.
- Verdict + category filter chips: animated selection (the active pill should animate its background fill with a spring, not snap). Consider an animated underline/highlight that slides between active chips.
- Grid: `FlatList` items wrapped so each fades+rises in on first render (stagger by index within the visible window). Use `PhotoFrame` via the upgraded `ProductCard`.
- Loading & pagination: skeleton grid for first load; a small animated footer spinner for "load more".

### 3.4 Product detail — `app/product/[slug].tsx` + `src/components/pdp/*`
Already feature-complete in content; make it feel premium.
- **Gallery:** Keep paging. Animate the dot indicator (active dot width springs 6→18px — already partially done; ensure it's Reanimated-driven and smooth). Add a subtle parallax/scale on the image as you swipe if cheap to do; otherwise skip.
- **Verdict card:** Use `LinearGradient` (already used) but refine — verdict color → transparent, big serif score (52px), grade badge, why text. Animate the big score number counting up from 0 → value on mount (`withTiming` over ~600ms, round in a worklet) for a premium reveal.
- **Section reveals:** Each section (`PdpScoreWhy`, `PdpSwaps`, `PdpIngredients`, `PdpNutrition`, concerns, more-like-this) wrapped in `FadeInUp`, revealing as the user scrolls (use Reanimated `useAnimatedScrollHandler` + on-enter, or simply mount-stagger — mount-stagger is acceptable and simpler).
- **Hairline dividers** between sections instead of plain lines.
- **Ingredients:** the expand/collapse of the "why" should animate height (`Layout` animation or animated height), not pop. Risk dots already colored — keep.
- **Nutrition rows:** keep color logic; consider animating the bar fills on first appear.
- **Sticky CTA bar:** wrap in `GlassView` (blur) so content scrolls under it premium-ly. Button press = `PressableScale` + medium haptic. Add→checkmark transition should animate (cross-fade icon + label).

### 3.5 Basket tab — `app/(tabs)/basket.tsx`
- Header: eyebrow + serif title + the basket health score presented as a hero stat (big serif number with verdict color).
- List items (`BasketCartLine`): `FadeInUp` stagger; removal should animate out (`Layout` exiting animation — item collapses/fades, list reflows smoothly).
- Swap suggestions: `PressableScale` cards.
- Empty state: editorial, with `DisplayHero`-style line + two `PressableScale` CTAs (Browse / Ask Scout).

### 3.6 Account tab — `app/(tabs)/account.tsx`
- Restyle as clean settings cards on `panel` surfaces with hairline separators.
- Plan card: if Plus, a subtle gradient accent border; if Free, a clear upgrade CTA card with `PressableScale`.
- Rows animate in with light stagger.

### 3.7 Login — `app/(auth)/login.tsx`
- Apply `DisplayHero` branding at top (the Scout identity + tagline).
- OAuth / phone buttons: `PressableScale`, consistent radii, hairline separators between methods ("or" divider using `Hairline`).
- Keep all auth logic untouched.

### 3.8 Subscribe — `app/subscribe.tsx`
- Make it feel like a premium paywall: serif headline, the 4 feature bullets with accent check icons, price prominent, `PressableScale` CTA. Subtle gradient header.

### 3.9 Tab bar — `app/(tabs)/_layout.tsx`
- Wrap the tab bar background in `GlassView` (blur) with a hairline top border, floating feel.
- Active tab: animate the icon (slight scale pop + accent color fade) on focus. Keep the basket badge.
- Ensure safe-area bottom inset handled.

### 3.10 Global navigation transitions — `app/_layout.tsx`
- Set Stack `screenOptions` animation to a smooth slide/fade (`animation: "slide_from_right"` for product, keep `fade` where appropriate). Ensure pushing a PDP and coming back feels fluid. Don't reintroduce modal presentation for search.

---

## 4. Motion spec (apply consistently)

| Interaction | Spec |
|---|---|
| Screen/section entrance | `FadeInUp`: opacity 0→1, translateY 12→0, `motion.timing` (280ms), stagger `motion.stagger` (45ms) per item, cap index at 8 |
| Card / button press | `PressableScale`: scale→0.97, `springSnappy`; release→1 |
| Primary CTA press | + `Haptics.impactAsync(Medium)` |
| Card add-to-basket | + `Haptics.impactAsync(Light)`; icon cross-fades add→check |
| Filter chip select | background fill springs in (`springSoft`), not instant |
| PDP score reveal | number counts 0→value over ~600ms `withTiming`, rounded in worklet |
| Gallery dot | active dot width 6→18px `withSpring` |
| List item removal | Reanimated exiting layout animation (fade + collapse) |
| Marquee | continuous `translateX` loop, ~60s/cycle, edge gradient masks, pause on touch |
| Loading | Skeleton shimmer (~1.2s loop), never a bare spinner on full screens |

All animations run via Reanimated worklets (UI thread). Respect `AccessibilityInfo.isReduceMotionEnabled()` — when on, skip transforms/marquee, keep instant opacity. Add a `useReducedMotion` helper.

---

## 5. Execution phases (order matters)

- **Phase 1 — Foundations:** install `expo-blur`; create `motion.ts`, `FadeInUp`, `PressableScale`, `Skeleton`, `GlassView`, `Hairline`, `PhotoFrame`, `DisplayHero`, `useReducedMotion`. Verify each in isolation on device. **Do not touch screens yet.**
- **Phase 2 — Component adoption:** upgrade `ProductCard`, `ScoreBadge`, `VerdictPill`, `ScoutSearchBar`, `PromptChips`, `SiteHeader` to use the new primitives. These cascade to every screen.
- **Phase 3 — Flagship screens:** Ask tab (hero + marquee + cross-fade), then PDP (score count-up, glass CTA, section reveals).
- **Phase 4 — Remaining screens:** Browse, Basket, Account, Login, Subscribe, Tab bar, Stack transitions.
- **Phase 5 — Polish pass:** reduced-motion handling, dark/light parity check on every screen, 60fps verification, remove dead code.

Commit at the end of each phase. Typecheck (`npx tsc --noEmit`) must pass before each commit.

---

## 6. Reference values (from the web — use verbatim)

**Verdict colors** (mobile theme already exposes `scoreExcellent/Good/Poor/Bad`; map verdicts→tiers):
- `daily_staple` → score-excellent (`#24a66f` dark / `#16a34a` light)
- `good_choice` → score-good (`#8a9f39` dark / `#84a822` light)
- `occasional_treat` → score-poor (`#c9842f` dark / `#d97706` light)
- `skip` → score-bad (`#c85f5f` dark / `#dc2626` light)
- Chip = transparent bg, border + text in tier color. Card = 10–12% tier tint over panel, border 28% tier.

**Score→band:** `>=76 excellent · >=51 good · >=26 poor · else bad`.
**Score→grade:** `>=85 A · >=70 B · >=55 C · >=40 D · else F`.

**Spacing rhythm:** sections breathe — vertical padding ~`spacing.xl` between major blocks. Horizontal page padding `spacing.lg`. Card internal `spacing.md`.

**Radii:** cards/images `radius.xl` (20), badges `10px`, chips `radius.full`, small panels `radius.lg`.

**Fonts:** display = Instrument Serif (use for all headlines, scores, hero); body/labels = Inter (Regular/Medium/SemiBold/Bold). Italic accent = `InstrumentSerif_400Regular_Italic` in `colors.accent`.

---

## 7. Guardrails — do NOT change

- API layer (`src/lib/api.ts`), types (`src/types/api.ts` — only extend, never remove), auth (`src/lib/auth.tsx`), basket logic (`src/lib/basket.tsx`), config, supabase client.
- Routing structure / screen file locations.
- The inline-search behavior on the Ask tab (no modal).
- Data shapes returned by the backend.
- Light/dark theme context API (`useTheme()`).

## 8. Definition of done

- Every screen animates on entrance; every interactive element has press feedback; no bare full-screen spinners.
- Ask tab has the editorial serif hero + a live marquee.
- PDP has the animated score reveal + glass sticky CTA + hairline-separated, revealing sections.
- Floating glass tab bar + nav.
- Looks correct and premium in BOTH light and dark mode.
- Reduced-motion users get a calm, instant experience.
- 60fps on a mid-range device; `tsc --noEmit` clean; no console warnings from Reanimated.
