import hotel from "../../data/hotel.json";

export type KBSection = { id: string; title: string; text: string; keywords: string[] };

const STOP = new Set(["the", "a", "an", "is", "are", "do", "does", "you", "your", "have", "has", "what", "which", "how", "i", "we", "it", "in", "of", "for", "to", "and", "or", "at", "on", "with", "can", "there", "any", "be", "my", "me", "hotel", "room", "rooms"]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w));
}

/** Flatten hotel.json into retrievable sections. Built once at module load. */
export function buildSections(): KBSection[] {
  const p = hotel.property;
  const sections: KBSection[] = [
    {
      id: "property",
      title: "Property",
      text: `${p.name}: ${p.tagline}. Address: ${p.address}. Phone ${p.phone}, email ${p.email}. Check-in from ${p.checkInTime}, check-out by ${p.checkOutTime}. Prices in ${p.currency}. Languages spoken: ${p.languages.join(", ")}.`,
      keywords: ["address", "location", "phone", "contact", "email", "check", "checkin", "checkout", "time", "arrive", "arrival", "depart", "language", "where"],
    },
  ];
  for (const r of hotel.rooms) {
    sections.push({
      id: `room:${r.id}`,
      title: `Room type: ${r.name}`,
      text: `${r.name}: sleeps up to ${r.capacity} guests, ${r.beds}, ${r.sizeSqm} sqm, ${r.view.toLowerCase()}, INR ${r.pricePerNight} per night, breakfast ${r.breakfastIncluded ? "included" : "not included"}. Features: ${r.features.join(", ")}.`,
      keywords: ["room", "suite", "bed", "sleep", "guest", "people", "person", "adult", "family", "price", "cost", "rate", "night", "view", "balcony", "size", String(r.capacity), ...tokenize(r.name)],
    });
  }
  for (const a of hotel.amenities) {
    sections.push({
      id: `amenity:${a.name}`,
      title: `Amenity: ${a.name}`,
      text: `${a.name}: ${a.description} Hours: ${a.hours}. Cost: ${a.cost}.`,
      keywords: [...tokenize(a.name), ...tokenize(a.description).slice(0, 12), "amenity", "facility", "hour", "open"],
    });
  }
  for (const pol of hotel.policies) {
    sections.push({
      id: `policy:${pol.topic}`,
      title: `Policy: ${pol.topic}`,
      text: pol.text,
      keywords: [...tokenize(pol.topic), ...tokenize(pol.text).slice(0, 15), "policy", "rule", "allowed", "fee", "charge"],
    });
  }
  for (const f of hotel.faqs) {
    sections.push({
      id: `faq:${f.question}`,
      title: `FAQ: ${f.question}`,
      text: `${f.question} ${f.answer}`,
      keywords: [...tokenize(f.question), ...tokenize(f.answer).slice(0, 10)],
    });
  }
  return sections;
}

const SECTIONS = buildSections();

const SYNONYMS: Record<string, string[]> = {
  pool: ["swimming", "swim"],
  swimming: ["pool"],
  breakfast: ["meal", "food", "buffet"],
  cancel: ["cancellation", "refund"],
  cancellation: ["cancel", "refund"],
  refund: ["cancellation", "cancel"],
  gym: ["fitnes", "fitness", "workout"],
  parking: ["car", "park"],
  wifi: ["wi", "fi", "internet"],
  internet: ["wifi", "wi", "fi"],
  dog: ["pet"],
  cat: ["pet"],
  kid: ["child", "children"],
  child: ["children", "kid", "crib"],
  three: ["3"],
  four: ["4"],
  two: ["2"],
  airport: ["shuttle", "transfer"],
  beach: ["far", "distance"],
  checkin: ["check", "arrival"],
  checkout: ["check", "departure"],
  late: ["check", "checkout", "checkin"],
  early: ["check", "checkin"],
};

/** Keyword retrieval with light synonym expansion. Returns top-k sections with score > 0. */
export function retrieve(query: string, extraTopics: string[] = [], k = 5): KBSection[] {
  const terms = new Set(tokenize(`${query} ${extraTopics.join(" ")}`));
  for (const t of [...terms]) for (const s of SYNONYMS[t] ?? []) terms.add(s);
  const scored = SECTIONS.map((s) => {
    let score = 0;
    for (const t of terms) {
      if (s.keywords.includes(t)) score += 2;
      if (s.text.toLowerCase().includes(t)) score += 1;
    }
    return { s, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => x.s);
}

export function allSections(): KBSection[] {
  return SECTIONS;
}

export const CONTACT_LINE = `You can reach the front desk at ${hotel.property.phone} or ${hotel.property.email}.`;
export const HOTEL_NAME = hotel.property.name;
