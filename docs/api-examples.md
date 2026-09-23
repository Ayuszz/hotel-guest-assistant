# API examples

Base URL: `http://localhost:3000` locally. Every endpoint below except `/api/health`, `/api/auth/signup` and `/api/auth/logout` requires a Supabase session cookie — sign up first and reuse a curl cookie jar (`-c cookies.txt -b cookies.txt`) for the rest of the walkthrough. Examples were captured against a production build (`next start`) with `LLM_PROVIDER=mock`, so wording of `text` answers is the raw knowledge-base text; with a real key the shapes are identical but the phrasing is generated.

## Health

```bash
curl -s http://localhost:3000/api/health
```
```json
{"status":"ok","provider":"mock","time":"2026-09-23T07:27:12.192Z"}
```

## 0. Sign up (required before anything else)

```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"guest@example.test","password":"correct horse battery staple"}'
```
```json
{"ok":true}
```

The response sets the Supabase session cookie in `cookies.txt` (via `@supabase/ssr`); every following request reuses it with `-b cookies.txt`. Signing up with an email that already exists returns `409` with `code: "EMAIL_TAKEN"`. Signing in (not shown — it's a direct Supabase Auth call from the browser, not a custom route) uses the same cookie mechanism; wrong credentials surface as an inline error in the UI.

```bash
curl -s -X POST http://localhost:3000/api/auth/logout -b cookies.txt
```
```json
{"ok":true}
```

## 1. A property question (starts a new thread)

`conversationId` is omitted on the first message; the server creates a thread and returns its id.

```bash
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What time is check-in?"}'
```
```json
{"type":"text","conversationId":"0cad558f-e241-4002-b564-712d4e70a815","message":"Marigold Bay Hotel: A 48-room boutique hotel on the Goa coastline. Address: 12 Coconut Grove Road, Candolim, Goa 403515, India. Phone +91 832 555 0142, email stay@marigoldbay.example. Check-in from 15:00, check-out by 11:00. Prices in INR. Languages spoken: English, Hindi, Konkani.","sources":["property"]}
```

## 2. A follow-up in the same thread

The request no longer carries `history` — the server loads it from Postgres by `conversationId`, scoped to the signed-in user.

```bash
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"0cad558f-e241-4002-b564-712d4e70a815","message":"Is breakfast included?"}'
```
```json
{"type":"text","conversationId":"0cad558f-e241-4002-b564-712d4e70a815","message":"Breakfast: Buffet breakfast at the Saffron restaurant with Indian and continental options. Included for Deluxe King, Junior Suite and Family Suite. Available as an add-on for Standard Double and Twin Room. Hours: 07:00 to 10:30. Cost: INR 650 per person per day when not included.","sources":["amenity:Breakfast"]}
```

Continuing a `conversationId` that belongs to a different user (or doesn't exist) returns `404` with `code: "NOT_FOUND"` — deliberately not `403`, so the response gives no signal about whether the id exists (see decisions.md).

## 3. Availability intent without dates → clarification

```bash
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"0cad558f-e241-4002-b564-712d4e70a815","message":"Do you have rooms available?"}'
```
```json
{"type":"clarification","conversationId":"0cad558f-e241-4002-b564-712d4e70a815","needs":["checkIn","checkOut","adults"],"known":{},"message":"Happy to check availability. Please confirm your check-in date, your check-out date and the number of guests below."}
```

## 4. Structured availability request (what the date form sends) → tool result

```bash
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"0cad558f-e241-4002-b564-712d4e70a815","availability":{"checkIn":"2030-03-10","checkOut":"2030-03-12","adults":3}}'
```
```json
{"type":"availability","conversationId":"0cad558f-e241-4002-b564-712d4e70a815",
 "message":"Good news: 2 room types are available for 3 guests, 10 Mar 2030 to 12 Mar 2030 (2 nights), from INR 9,200 per night (Junior Suite).",
 "data":{"checkIn":"2030-03-10","checkOut":"2030-03-12","adults":3,"nights":2,"currency":"INR",
  "rooms":[
   {"id":"junior-suite","name":"Junior Suite","capacity":3,"pricePerNight":9200,"totalPrice":18400,"breakfastIncluded":true,"available":true,"roomsLeft":6},
   {"id":"family-suite","name":"Family Suite","capacity":4,"pricePerNight":12500,"totalPrice":25000,"breakfastIncluded":true,"available":true,"roomsLeft":4}]}}
```

Availability in natural language also works when the model can extract every slot, e.g. `"Any rooms from 2030-03-10 to 2030-03-12 for 3 adults?"`.

## 5. Book a room (simulated payment)

Fields come straight off a room in the availability response above. No card details, no real gateway — the server marks it paid in the same call.

```bash
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"0cad558f-e241-4002-b564-712d4e70a815","roomId":"junior-suite","roomName":"Junior Suite","checkIn":"2030-03-10","checkOut":"2030-03-12","nights":2,"adults":3,"pricePerNight":9200,"totalPrice":18400,"currency":"INR"}'
```
```json
{"booking":{"id":"55740fbc-ac03-4030-8c7a-4e028882bac0","user_id":"91c099dd-00c3-44d5-ae31-cd2e771ec490","conversation_id":"0cad558f-e241-4002-b564-712d4e70a815","room_id":"junior-suite","room_name":"Junior Suite","check_in":"2030-03-10","check_out":"2030-03-12","nights":2,"adults":3,"price_per_night":9200,"total_price":18400,"currency":"INR","status":"confirmed","payment_status":"paid","payment_reference":"MOCK-E32273F1","created_at":"2026-09-23T07:28:19.857153+00:00","updated_at":"2026-09-23T07:28:19.857153+00:00"}}
```
HTTP 201. `conversationId` is optional on this endpoint (a booking doesn't have to originate from a chat thread).

```bash
curl -s -b cookies.txt -c cookies.txt http://localhost:3000/api/bookings
```
```json
{"bookings":[{"id":"55740fbc-ac03-4030-8c7a-4e028882bac0","room_id":"junior-suite","room_name":"Junior Suite","check_in":"2030-03-10","check_out":"2030-03-12","nights":2,"adults":3,"price_per_night":9200,"total_price":18400,"currency":"INR","status":"confirmed","payment_status":"paid","payment_reference":"MOCK-E32273F1","created_at":"2026-09-23T07:28:19.857153+00:00"}]}
```
Scoped to the signed-in user, newest first.

## 6. List threads and reload a thread's history

```bash
curl -s -b cookies.txt -c cookies.txt http://localhost:3000/api/conversations
```
```json
{"conversations":[{"id":"0cad558f-e241-4002-b564-712d4e70a815","title":"What time is check-in?","updated_at":"2026-09-23T07:28:11.048996+00:00"}]}
```
`title` is auto-derived from the first message (truncated to 60 chars) the first time a thread is written to; `updated_at` drives the sidebar's most-recent-first order.

```bash
curl -s -b cookies.txt -c cookies.txt http://localhost:3000/api/conversations/0cad558f-e241-4002-b564-712d4e70a815/messages
```
```json
{"messages":[
  {"id":"ff8d3c7d-e8b8-4458-9700-ee2030b72b31","role":"user","content":"What time is check-in?","envelope":null,"created_at":"2026-09-23T07:28:01.401012+00:00"},
  {"id":"ffc17a86-51d4-4b20-a0a7-c27563ac4e40","role":"assistant","content":"Marigold Bay Hotel: A 48-room boutique hotel on the Goa coastline. ...","envelope":{"type":"text","message":"...","sources":["property"],"conversationId":"0cad558f-e241-4002-b564-712d4e70a815"},"created_at":"2026-09-23T07:28:01.401012+00:00"}
]}
```
Every stored assistant turn carries its full response `envelope` (not just the text), so the sidebar can reconstruct an availability card or clarification form exactly, not just replay the message text. Requesting another user's conversation id, or one that doesn't exist, returns `404 NOT_FOUND`.

## 7. Out-of-scope question → fallback

```bash
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Who won the cricket world cup?"}'
```
```json
{"type":"fallback","conversationId":"c747ad32-acae-4ebe-9495-ba9048e3deb6","reason":"not_in_knowledge_base",
 "message":"I'm not able to answer that from the information I have about Marigold Bay Hotel. You can reach the front desk at +91 832 555 0142 or stay@marigoldbay.example."}
```
No `conversationId` was given, so this started (and immediately used) a new thread. `reason` values: `not_in_knowledge_base`, `out_of_scope`, `unverified_figure`, `llm_unavailable`.

## 8. Validation and auth errors

```bash
curl -s -w ' [%{http_code}]' -b cookies.txt http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":""}'
# {"type":"error","message":"Message is required; Either message or availability is required","code":"INVALID_REQUEST"} [400]

curl -s -w ' [%{http_code}]' -b cookies.txt http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{oops'
# {"type":"error","message":"Body must be valid JSON","code":"INVALID_JSON"} [400]

curl -s -w ' [%{http_code}]' -b cookies.txt http://localhost:3000/api/chat -H 'Content-Type: application/json' \
  -d '{"availability":{"checkIn":"2026-01-01","checkOut":"2026-01-03","adults":2}}'
# {"type":"error","conversationId":"e59648b4-945d-40a2-adbb-46138b6f2fd7","message":"Check-in date cannot be in the past.","code":"INVALID_STAY"} [400]

curl -s -w ' [%{http_code}]' http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":"hi"}'
# no cookie jar -> {"type":"error","message":"Please sign in to chat.","code":"UNAUTHENTICATED"} [401]
```

## Request schema

```ts
// POST /api/chat — requires a Supabase session cookie
{
  conversationId?: string;   // UUID of an existing thread you own; omitted starts a new thread
  message?: string;          // 1..1000 chars
  availability?: { checkIn:"YYYY-MM-DD"; checkOut:"YYYY-MM-DD"; adults:1..8 };
}
// one of message | availability is required; history is never sent by the client

// POST /api/auth/signup
{ email: string; password: string /* min 8 chars */ }

// POST /api/bookings — requires a Supabase session cookie
{
  conversationId?: string;
  roomId: string; roomName: string;
  checkIn: "YYYY-MM-DD"; checkOut: "YYYY-MM-DD";
  nights: number; adults: 1..8;
  pricePerNight: number; totalPrice: number; currency: string;
}
```
