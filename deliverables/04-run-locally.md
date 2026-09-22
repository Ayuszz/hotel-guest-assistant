# 4. Run the frontend and backend locally

Requirements: Node 20 or newer, npm.

```bash
git clone https://github.com/Ayuszz/hotel-guest-assistant.git
cd hotel-guest-assistant
npm install
cp .env.example .env
```

Edit `.env`:

- With a key: set `CEREBRAS_API_KEY` (free at https://cloud.cerebras.ai) and/or `GEMINI_API_KEY` (free at https://aistudio.google.com/apikey).
- Without any key: leave them empty or set `LLM_PROVIDER=mock`. The app runs fully offline with a deterministic mock model; every feature still works, answers are the raw knowledge-base text.

```bash
npm run dev          # http://localhost:3000
```

Verify:

```bash
curl -s localhost:3000/api/health
# {"status":"ok","provider":"cerebras:gpt-oss-120b > gemini:gemini-3.1-flash-lite","time":"..."}
```

Then in the browser: click a suggested question, ask a follow-up, ask "Do you have rooms available?", fill the form, see the card.

Tests and checks:

```bash
npm test             # 60 vitest tests, offline
npm run test:e2e     # Playwright browser flow (builds first; installs Chromium on first run with: npx playwright install chromium)
npm run typecheck
npm run lint
npm run build && npm start   # production build on http://localhost:3000
```
