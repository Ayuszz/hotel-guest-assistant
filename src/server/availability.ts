import inventory from "../../data/inventory.json";
import hotel from "../../data/hotel.json";
import type { AvailabilityParams, AvailabilityResult, RoomAvailability } from "./types";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

type Booking = { checkIn: string; checkOut: string; count: number };
type InventoryRoom = { totalRooms: number; bookings: Booking[] };
type Inventory = { rooms: Record<string, InventoryRoom> };

const MAX_NIGHTS = 30;

function parseDate(s: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError(`${label} must be YYYY-MM-DD`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new ValidationError(`${label} is not a real calendar date`);
  }
  return d;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = parseDate(checkIn, "checkIn");
  const b = parseDate(checkOut, "checkOut");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Throws ValidationError with a guest-readable message. `today` is injectable for tests. */
export function validateStay(params: AvailabilityParams, today = new Date()): void {
  const checkIn = parseDate(params.checkIn, "checkIn");
  parseDate(params.checkOut, "checkOut");
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (checkIn < todayUtc) throw new ValidationError("Check-in date cannot be in the past.");
  const nights = nightsBetween(params.checkIn, params.checkOut);
  if (nights < 1) throw new ValidationError("Check-out must be at least one day after check-in.");
  if (nights > MAX_NIGHTS) throw new ValidationError(`Stays are limited to ${MAX_NIGHTS} nights. Please contact the hotel for longer stays.`);
  if (!Number.isInteger(params.adults) || params.adults < 1 || params.adults > 8) {
    throw new ValidationError("Number of guests must be between 1 and 8.");
  }
}

function eachNight(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  const d = parseDate(checkIn, "checkIn");
  const end = parseDate(checkOut, "checkOut");
  while (d < end) {
    nights.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return nights;
}

function bookedOn(room: InventoryRoom, night: string): number {
  return room.bookings
    .filter((b) => b.checkIn <= night && night < b.checkOut)
    .reduce((sum, b) => sum + b.count, 0);
}

/**
 * Mock availability tool. Deterministic over data/inventory.json.
 * Rooms with capacity below `adults` are excluded entirely.
 */
export function checkAvailability(
  params: AvailabilityParams,
  opts: { today?: Date; inventory?: Inventory } = {},
): AvailabilityResult {
  validateStay(params, opts.today);
  const inv = opts.inventory ?? (inventory as Inventory);
  const nights = eachNight(params.checkIn, params.checkOut);

  const rooms: RoomAvailability[] = hotel.rooms
    .filter((r) => r.capacity >= params.adults)
    .map((r) => {
      const stock = inv.rooms[r.id];
      const roomsLeft = stock
        ? Math.min(...nights.map((n) => stock.totalRooms - bookedOn(stock, n)))
        : 0;
      return {
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        pricePerNight: r.pricePerNight,
        totalPrice: r.pricePerNight * nights.length,
        breakfastIncluded: r.breakfastIncluded,
        available: roomsLeft > 0,
        roomsLeft: Math.max(0, roomsLeft),
      };
    })
    .sort((a, b) => Number(b.available) - Number(a.available) || a.pricePerNight - b.pricePerNight);

  return {
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: params.adults,
    nights: nights.length,
    currency: hotel.property.currency,
    rooms,
  };
}
