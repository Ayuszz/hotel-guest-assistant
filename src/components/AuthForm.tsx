"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Could not create your account.");
      } else {
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw new Error(signInError.message === "Invalid login credentials" ? "Incorrect email or password." : signInError.message);
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="h-10 w-10 rounded-full bg-amber-400 mx-auto flex items-center justify-center text-stone-900 font-bold mb-2" aria-hidden>M</div>
          <h1 className="text-lg font-semibold">Marigold Bay Hotel</h1>
          <p className="text-sm text-stone-500">{mode === "signin" ? "Sign in to continue" : "Create an account"}</p>
        </div>
        <form onSubmit={submit} className="bg-white border border-stone-200 rounded-xl p-5 space-y-3 shadow-sm">
          <label className="block text-xs text-stone-700">
            Email
            <input
              type="email" required autoComplete="email" value={email} disabled={pending}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500 disabled:bg-stone-100"
            />
          </label>
          <label className="block text-xs text-stone-700">
            Password
            <input
              type="password" required minLength={8} disabled={pending}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500 disabled:bg-stone-100"
            />
          </label>
          {error && <p role="alert" data-testid="auth-error" className="text-xs text-red-700">{error}</p>}
          <button type="submit" disabled={pending} className="w-full rounded-md bg-stone-900 text-white text-sm font-medium py-2.5 disabled:opacity-50">
            {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="text-center text-xs text-stone-500 mt-4">
          {mode === "signin" ? (
            <>New here? <Link href="/signup" className="underline">Create an account</Link></>
          ) : (
            <>Already have an account? <Link href="/login" className="underline">Sign in</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
