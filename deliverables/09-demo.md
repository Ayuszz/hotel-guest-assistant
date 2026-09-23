# 9. Deployed demo and screen recording

**Live URL:** https://hotel-guest-assistant-lilac.vercel.app — currently serves the pre-auth version of the app (no login wall, client-carried history, no bookings). The auth/persistence/bookings rewrite described in the rest of this packet was built and verified **locally only** (real Supabase project, real LLM providers where keyed, Playwright against a production build) and has not been pushed or redeployed; the live URL will not reflect it until that happens. Health: https://hotel-guest-assistant-lilac.vercel.app/api/health

**Screenshots:** `screenshots/desktop.png`, `screenshots/mobile.png` (captured from the live pre-auth site). Not yet refreshed for the auth/threads/bookings rewrite.

**Screen recording plan (3 to 4 minutes), to record once the rewrite is deployed**

1. Open the URL, sign up with an email and password.
2. Point out the suggested questions; ask "Is breakfast included?" — typing indicator, then the grounded answer.
3. Follow up: "Which room is suitable for three guests?" then "How much is it per night?" — context carried across turns via the server, not the browser.
4. Ask "Do you have rooms available?" — the in-chat date form appears; dates are never parsed from free text.
5. Submit the form for 3 guests, 10 to 12 March — result card with prices and totals, computed in code, not by the model.
6. Click "Book & pay (mock)" on a room — inline "Booked & paid" confirmation with a mock reference; open `/bookings` to show it listed.
7. Open the sidebar, start a new chat, ask something else, then switch back to the first thread and show its own history reloads.
8. Ask "Who won the cricket world cup?" — fallback with front-desk contact.
9. DevTools → Network → Offline → send a question → red error bubble; go Online → Try again → recovers.
10. Sign out — redirected to `/login`; try to open `/` directly — redirected back.
11. DevTools device toolbar → phone width → same flow works, sidebar becomes an off-canvas drawer.
12. Terminal: `npm test` → 85 passing; `npm run test:e2e` → 12 passing (desktop + mobile).

Never show `.env`, tokens, or the Vercel dashboard.
