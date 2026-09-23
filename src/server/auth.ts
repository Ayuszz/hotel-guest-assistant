import { z } from "zod";
import { log } from "./logger";

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(72, "Password is too long."),
});

export type AdminAuth = {
  createUser(args: { email: string; password: string; email_confirm: boolean }): Promise<{
    error: { message: string; status?: number } | null;
  }>;
};

export type SessionAuth = {
  signInWithPassword(args: { email: string; password: string }): Promise<{ error: { message: string } | null }>;
};

export type SignupResult = { status: number; body: { ok: true } | { type: "error"; message: string; code: string } };

/**
 * Signs a new guest up. Supabase projects require email confirmation by default; this assignment
 * has no transactional email provider wired up, so the service-role admin API creates the user
 * pre-confirmed (email_confirm: true) and then signs them in immediately. Production would swap
 * this for Supabase's built-in confirmation email or a real SMTP provider.
 */
export async function handleSignup(input: unknown, deps: { admin: AdminAuth; session: SessionAuth }): Promise<SignupResult> {
  const parsed = SignupSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, body: { type: "error", message: parsed.error.issues[0]?.message ?? "Invalid email or password.", code: "INVALID_REQUEST" } };
  }
  const { email, password } = parsed.data;

  const { error: createError } = await deps.admin.createUser({ email, password, email_confirm: true });
  if (createError) {
    const taken = createError.status === 422 || /already|registered|exists/i.test(createError.message);
    log("warn", "auth.signup_failed", { taken, message: createError.message });
    return {
      status: taken ? 409 : 400,
      body: {
        type: "error",
        message: taken ? "An account with this email already exists." : "Could not create your account. Please try again.",
        code: taken ? "EMAIL_TAKEN" : "SIGNUP_FAILED",
      },
    };
  }

  const { error: signInError } = await deps.session.signInWithPassword({ email, password });
  if (signInError) {
    log("error", "auth.signin_after_signup_failed", { message: signInError.message });
    return { status: 500, body: { type: "error", message: "Account created, but sign-in failed. Please sign in.", code: "SIGNIN_FAILED" } };
  }

  return { status: 200, body: { ok: true } };
}
