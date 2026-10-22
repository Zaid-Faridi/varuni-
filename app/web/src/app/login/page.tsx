"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import {
  Lock,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Info,
  RefreshCw,
} from "lucide-react";
import VaruniLogo from "@/components/common/VaruniLogo";

export default function LoginPage() {
  const router = useRouter();
  const { login, demoLogin } = useAuth();

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuickLogin = async (role: string = "admin") => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await demoLogin(role);
      if (res.success) {
        router.push("/dashboard");
      } else {
        setError(res.error || "Demo login failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!usernameOrEmail.trim() || !password.trim()) {
      setError("Please enter both username/email and password.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(usernameOrEmail, password);
      if (result.success) {
        router.push("/dashboard");
      } else {
        setError(result.error || "Authentication failed. Check your credentials.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during login. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col justify-between font-sans">
      {/* Top Institutional Header */}
      <header className="bg-white border-b border-slate-300 px-4 py-3 shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VaruniLogo size="md" showText={true} />
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span className="font-medium">National Geo-Portal Authentication</span>
          </div>
        </div>
      </header>

      {/* Main Login Container */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-300 rounded shadow-xs overflow-hidden">
          {/* Card Top Banner */}
          <div className="bg-[#0f2d59] text-white px-6 py-4 border-b border-slate-300">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold tracking-wide">
                  Sign In to VARUNI
                </h1>
                <p className="text-xs text-slate-300 mt-0.5">
                  Watershed Monitoring & Verification Command Center
                </p>
              </div>
              <span className="text-[10px] font-mono bg-sky-900/90 text-sky-200 px-2 py-0.5 rounded border border-sky-700">
                Official Portal
              </span>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs rounded font-medium flex items-center gap-2 animate-in fade-in duration-150">
                <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Instant Demo Sign-in Button */}
            <button
              type="button"
              onClick={() => handleQuickLogin("admin")}
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>⚡ Instant Demo Sign In (Enter Dashboard)</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-400">
                Or Sign In with Credentials
              </span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username or Email Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Official Email or Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    placeholder="admin or admin@watershed.gov.in"
                    className="w-full text-xs bg-white border border-slate-300 rounded pl-9 pr-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700 font-medium"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full text-xs bg-white border border-slate-300 rounded pl-9 pr-9 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-[#0f2d59] hover:bg-[#0c2447] text-white rounded font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Sign-in Section */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                <span>1-Click Role Login:</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin("admin")}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-900 hover:border-emerald-300 border border-slate-300 rounded text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-left"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                  <span>👑 Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin("gis_analyst")}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-sky-50 hover:text-sky-900 hover:border-sky-300 border border-slate-300 rounded text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-left"
                >
                  <span className="w-2 h-2 rounded-full bg-sky-600 shrink-0" />
                  <span>🛰️ Analyst</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin("field_officer")}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300 border border-slate-300 rounded text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-left"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
                  <span>📋 Officer</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin("reviewer")}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-purple-50 hover:text-purple-900 hover:border-purple-300 border border-slate-300 rounded text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-left"
                >
                  <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />
                  <span>🔍 Reviewer</span>
                </button>
              </div>
            </div>

            <div className="pt-2 text-center">
              <p className="text-[11px] text-slate-500">
                Sign in with credentials set in your environment (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono">ADMIN_PASSWORD</code>) or use 1-click role login.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-300 py-3 px-4 text-center text-xs text-slate-500 font-mono">
        VARUNI Platform • PostGIS + 30m Satellite GIS
      </footer>
    </div>
  );
}
