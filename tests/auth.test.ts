import { describe, expect, it, vi } from "vitest";
import { handleSignup, type AdminAuth, type SessionAuth } from "@/server/auth";

function deps(overrides: { admin?: Partial<AdminAuth>; session?: Partial<SessionAuth> } = {}) {
  const admin: AdminAuth = {
    createUser: vi.fn().mockResolvedValue({ error: null }),
    ...overrides.admin,
  };
  const session: SessionAuth = {
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    ...overrides.session,
  };
  return { admin, session };
}

describe("handleSignup: validation", () => {
  it("rejects an invalid email", async () => {
    const r = await handleSignup({ email: "not-an-email", password: "longenough1" }, deps());
    expect(r.status).toBe(400);
  });
  it("rejects a short password", async () => {
    const r = await handleSignup({ email: "guest@example.com", password: "short" }, deps());
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ type: "error", code: "INVALID_REQUEST" });
  });
});

describe("handleSignup: success", () => {
  it("creates a pre-confirmed user and signs them in", async () => {
    const { admin, session } = deps();
    const r = await handleSignup({ email: "Guest@Example.com", password: "longenough1" }, { admin, session });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(admin.createUser).toHaveBeenCalledWith({ email: "guest@example.com", password: "longenough1", email_confirm: true });
    expect(session.signInWithPassword).toHaveBeenCalledWith({ email: "guest@example.com", password: "longenough1" });
  });
});

describe("handleSignup: failure modes", () => {
  it("returns 409 when the email is already registered", async () => {
    const { admin, session } = deps({ admin: { createUser: vi.fn().mockResolvedValue({ error: { message: "User already registered", status: 422 } }) } });
    const r = await handleSignup({ email: "taken@example.com", password: "longenough1" }, { admin, session });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "EMAIL_TAKEN" });
  });
  it("returns 400 when account creation fails for another reason", async () => {
    const { admin, session } = deps({ admin: { createUser: vi.fn().mockResolvedValue({ error: { message: "Something else broke" } }) } });
    const r = await handleSignup({ email: "guest@example.com", password: "longenough1" }, { admin, session });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "SIGNUP_FAILED" });
  });
  it("returns 500 when the account is created but the immediate sign-in fails", async () => {
    const { admin, session } = deps({ session: { signInWithPassword: vi.fn().mockResolvedValue({ error: { message: "boom" } }) } });
    const r = await handleSignup({ email: "guest@example.com", password: "longenough1" }, { admin, session });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "SIGNIN_FAILED" });
  });
});
