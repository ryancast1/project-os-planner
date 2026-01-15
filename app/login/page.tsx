"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function clsx(...p: Array<string | false | null | undefined>) {
  return p.filter(Boolean).join(" ");
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/planner";

  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If already logged in, bounce.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(next);
    });
  }, [router, next]);

  async function sendCode() {
    setMsg(null);
    setBusy(true);
    try {
      const e = email.trim().toLowerCase();
      if (!e) throw new Error("Enter your email.");

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      setStage("code");
      setMsg("Code sent. Check your email.");
    } catch (err: any) {
      setMsg(err?.message || "Failed to send code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setMsg(null);
    setBusy(true);
    try {
      const e = email.trim().toLowerCase();
      const t = code.trim();
      if (!e) throw new Error("Missing email.");
      if (!t) throw new Error("Enter the code.");

      const { error } = await supabase.auth.verifyOtp({
        email: e,
        token: t,
        type: "email",
      });

      if (error) throw error;

      router.replace(next);
    } catch (err: any) {
      setMsg(err?.message || "Failed to verify code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh w-full px-4 py-6 sm:mx-auto sm:max-w-md">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm">
        <div className="text-xl font-semibold text-neutral-100">Sign in</div>
        <div className="mt-1 text-sm text-neutral-400">Email code (no magic link)</div>

        <div className="mt-5 space-y-3">
          <div>
            <div className="mb-1 text-xs text-neutral-400">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="you@email.com"
              className={clsx(
                "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[16px] text-neutral-100 outline-none sm:text-sm",
                stage === "code" && "opacity-80"
              )}
              disabled={busy || stage === "code"}
            />
          </div>

          {stage === "code" && (
            <div>
              <div className="mb-1 text-xs text-neutral-400">Code</div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-[16px] text-neutral-100 outline-none sm:text-sm"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") verifyCode();
                }}
              />
            </div>
          )}

          {msg && <div className="text-sm text-neutral-300">{msg}</div>}

          {stage === "email" ? (
            <button
              onClick={sendCode}
              disabled={busy}
              className="w-full rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={verifyCode}
                disabled={busy}
                className="flex-1 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 active:scale-[0.99] disabled:opacity-60"
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
              <button
                onClick={() => {
                  setStage("email");
                  setCode("");
                  setMsg(null);
                }}
                disabled={busy}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-100 active:scale-[0.99] disabled:opacity-60"
              >
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}