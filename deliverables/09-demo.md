# 9. Deployed demo and screen recording

**Live URL:** https://hotel-guest-assistant-lilac.vercel.app
Hosted on Vercel Hobby (free). Model: Cerebras gpt-oss-120b, with Gemini as automatic fallback. Health: https://hotel-guest-assistant-lilac.vercel.app/api/health

**Screenshots** (captured from the live site): `screenshots/desktop.png`, `screenshots/mobile.png`.

**Screen recording plan (3 to 4 minutes, record the live URL)**

1. Open the URL; point out the six suggested questions mapping to the brief.
2. Ask "Is breakfast included?" — show the typing indicator, then the grounded answer.
3. Follow up: "Which room is suitable for three guests?" then "How much is it per night?" — context carried across turns.
4. Ask "Do you have rooms available?" — the in-chat date form appears; dates are never parsed from free text.
5. Submit the form for 3 guests, 10 to 12 October — result card with prices and totals, computed in code, not by the model.
6. Ask "Who won the cricket world cup?" — fallback with front-desk contact.
7. DevTools → Network → Offline → send a question → red error bubble; go Online → Try again → recovers with history intact.
8. DevTools device toolbar → phone width → same chat works.
9. Terminal: `npm test` → 60 passing.
10. End on the README architecture section for a few seconds.

Never show `.env`, tokens, or the Vercel dashboard.
