/* eslint-disable */
"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthForm() {
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"identifier" | "otp">("identifier");
  const [isNewUser, setIsNewUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/portfolio";

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) return;

    setLoading(true);
    setError("");

    try {
      // Try sending OTP
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: identifier }), // The backend accepts 'mobile' for both, or we can use identifier logic
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send OTP");
      }

      if (data.is_existing_user) {
        setIsNewUser(false);
        setStep("otp");
      } else {
        setIsNewUser(true);
        // Since user is new, call register to send OTP and create account
        // Assuming user wants passwordless OTP, we generate a dummy password
        const regRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            identifier, 
            password: "KalpiUser@2026!", 
            full_name: "Kalpi User" 
          }),
        });

        const regData = await regRes.json();
        
        if (!regRes.ok && regData.error !== "User already exists. Please Login.") {
          throw new Error(regData.error || "Failed to register new user");
        }
        
        setStep("otp");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to verify OTP");
      }

      // Store token in cookie with 2 hours expiry (7200 seconds)
      document.cookie = `auth_token=${data.access_token}; path=/; max-age=7200; SameSite=Lax`;
      
      // Redirect
      router.push(redirectPath);
      router.refresh(); // Ensure middleware picks up the new cookie
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 font-sans text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">Kalpi AI</h1>
          <p className="mt-2 text-zinc-400">
            {step === "identifier"
              ? "Sign in or create an account"
              : "Enter the code sent to you"}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        {step === "identifier" ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-zinc-400 mb-2">
                Mobile Number or Email
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your mobile or email"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Sending..." : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-zinc-400 mb-2">
                One-Time Password
              </label>
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="Enter 4-digit code"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-center text-2xl tracking-widest text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                maxLength={4}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Verifying..." : "Verify & Login"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("identifier");
                setOtp("");
                setError("");
              }}
              className="w-full text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Use a different number/email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">Loading...</div>}>
      <AuthForm />
    </Suspense>
  );
}
