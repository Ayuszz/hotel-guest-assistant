# API examples

Base URL: `http://localhost:3000` locally, or the live deployment `https://hotel-guest-assistant-lilac.vercel.app`. All examples run against the mock provider as well; with a Gemini key the wording of `text` answers changes but the shapes do not.

## Health

```bash
curl -s http://localhost:3000/api/health
```
```json
{"status":"ok","provider":"gemini:gemini-3.1-flash-lite","time":"2026-09-22T18:04:14.610Z"}
```

## 1. A property question

```bash
curl -s http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"demo-1","message":"What time is check-in?"}'
```
```json
{"type":"text","conversationId":"demo-1","message":"Check-in is from 15:00 and check-out is by 11:00.","sources":["property"]}
```

## 2. A follow-up with client-carried history

The frontend sends the previous turns so the request works on any serverless instance.

```bash
curl -s http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "conversationId":"demo-1",
    "message":"How much is it per night?",
    "history":[
      {"role":"user","content":"Which room is suitable for three guests?"},
      {"role":"assistant","content":"The Junior Suite sleeps up to 3 guests with a king bed and a sofa bed."}
    ]}'
```
```json
{"type":"text","conversationId":"demo-1","message":"The Junior Suite is INR 9200 per night, breakfast included.","sources":["room:junior-suite"]}
```

## 3. Availability intent without dates → clarification

```bash
curl -s http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"demo-1","message":"Do you have rooms available?"}'
```
```json
{"type":"clarification","conversationId":"demo-1","needs":["checkIn","checkOut","adults"],"known":{},
 "message":"Happy to check availability. Please confirm your check-in date, your check-out date and the number of guests below."}
```

## 4. Structured availability request (what the date form sends) → tool result

```bash
curl -s http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"demo-1","availability":{"checkIn":"2026-10-10","checkOut":"2026-10-12","adults":3}}'
```
```json
{"type":"availability","conversationId":"demo-1",
 "message":"Good news: 2 room types are available for 3 guests, 10 Oct 2026 to 12 Oct 2026 (2 nights), from INR 9,200 per night (Junior Suite).",
 "data":{"checkIn":"2026-10-10","checkOut":"2026-10-12","adults":3,"nights":2,"currency":"INR",
  "rooms":[
   {"id":"junior-suite","name":"Junior Suite","capacity":3,"pricePerNight":9200,"totalPrice":18400,"breakfastIncluded":true,"available":true,"roomsLeft":6},
   {"id":"family-suite","name":"Family Suite","capacity":4,"pricePerNight":12500,"totalPrice":25000,"breakfastIncluded":true,"available":true,"roomsLeft":4}]}}
```

Availability in natural language also works when the model can extract every slot, e.g. `"Any rooms from 2026-10-10 to 2026-10-12 for 2 adults?"`.

## 5. Sold-out dates

```bash
curl -s http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"availability":{"checkIn":"2026-11-14","checkOut":"2026-11-15","adults":4}}'
```
Returns `type: "availability"` with `available: false` on the Family Suite and a "fully booked" message.

## 6. Out-of-scope question → fallback

```bash
curl -s http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Who won the cricket world cup?"}'
```
```json
{"type":"fallback","conversationId":"…","reason":"not_in_knowledge_base",
 "message":"I'm not able to answer that from the information I have about Marigold Bay Hotel. You can reach the front desk at +91 832 555 0142 or stay@marigoldbay.example."}
```

`reason` values: `not_in_knowledge_base`, `out_of_scope`, `unverified_figure`, `llm_unavailable`.

## 7. Validation errors (HTTP 400)

```bash
curl -s -w ' [%{http_code}]' http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":""}'
# {"type":"error","message":"Message is required; Either message or availability is required","code":"INVALID_REQUEST"} [400]

curl -s -w ' [%{http_code}]' http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{oops'
# {"type":"error","message":"Body must be valid JSON","code":"INVALID_JSON"} [400]

curl -s -w ' [%{http_code}]' http://localhost:3000/api/chat -H 'Content-Type: application/json' \
  -d '{"availability":{"checkIn":"2026-01-01","checkOut":"2026-01-03","adults":2}}'
# {"type":"error","conversationId":"…","message":"Check-in date cannot be in the past.","code":"INVALID_STAY"} [400]
```

## Request schema

```ts
{
  conversationId?: string;                 // client-generated; a new one is returned if absent
  message?: string;                        // 1..1000 chars
  history?: {role:"user"|"assistant"; content:string}[];  // ≤ 20 turns
  availability?: { checkIn:"YYYY-MM-DD"; checkOut:"YYYY-MM-DD"; adults:1..8 };
}
// one of message | availability is required
```
