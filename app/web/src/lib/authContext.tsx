"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "./api";

export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: string; // admin, gis_analyst, field_officer, reviewer, viewer
  organization?: string;
  is_active?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; error?: string }>;
  demoLogin: (role?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasRole: (...allowedRoles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => ({ success: false, error: "Not initialized" }),
  demoLogin: async () => ({ success: false, error: "Not initialized" }),
  logout: async () => {},
  hasRole: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Validate existing token on mount by calling the current user endpoint
  useEffect(() => {
    const initAuth = async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const userData: User = await res.json();
          setUser(userData);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));
        } else {
          // Token expired, invalid, or unauthorized - clear stored auth
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(AUTH_USER_KEY);
          setUser(null);
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            router.push("/login");
          }
        }
      } catch (err) {
        console.warn("Could not verify session with auth server:", err);
        // Never blindly trust cached localStorage when the backend is unreachable
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        setUser(null);
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          router.push("/login");
        }
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [API_BASE, router]);

  const login = async (usernameOrEmail: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username_or_email: usernameOrEmail.trim(),
          password: password,
        }),
      });

      if (res.ok) {
        const tokenData = await res.json();
        localStorage.setItem(AUTH_TOKEN_KEY, tokenData.access_token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(tokenData.user));
        setUser(tokenData.user);
        return { success: true };
      }

      // Handle non-2xx responses with user-friendly messages
      if (res.status === 429) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          error: errData.detail || "Too many failed login attempts. Please wait a moment before trying again.",
        };
      }

      if (res.status === 401 || res.status === 400 || res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          error: errData.detail || "Invalid username/email or password. Please verify your credentials.",
        };
      }

      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errData.detail || `Authentication failed (Server HTTP ${res.status}).`,
      };
    } catch {
      // Network error or server unreachable - zero synthetic data policy
      return {
        success: false,
        error: "Server unreachable. Cannot connect to the authentication service. Please check your network or verify the backend is running.",
      };
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = async (role: string = "admin"): Promise<{ success: boolean; error?: string }> => {
    // Only available when NEXT_PUBLIC_DEMO_MODE=1
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "1") {
      return { success: false, error: "Demonstration login is disabled." };
    }

    const demoCreds: Record<string, [string, string]> = {
      admin: [
        process.env.NEXT_PUBLIC_ADMIN_USERNAME || "admin",
        process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "",
      ],
      gis_analyst: [
        "analyst",
        process.env.NEXT_PUBLIC_DEMO_ANALYST_PASSWORD || "",
      ],
      field_officer: [
        "officer",
        process.env.NEXT_PUBLIC_DEMO_OFFICER_PASSWORD || "",
      ],
      reviewer: [
        "reviewer",
        process.env.NEXT_PUBLIC_DEMO_REVIEWER_PASSWORD || "",
      ],
    };

    const creds = demoCreds[role] || demoCreds.admin;
    const [uname, pass] = creds;

    if (!pass) {
      return {
        success: false,
        error: `Demo password not configured for role '${role}'. Set NEXT_PUBLIC_DEMO_${role.toUpperCase()}_PASSWORD in environment.`,
      };
    }

    // Call the REAL login API - no local demo tokens!
    return await login(uname, pass);
  };

  const logout = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (token) {
      try {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }).catch(() => {});
      } catch {
        // Ignore network errors during logout
      }
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
    setUser(null);
    router.push("/login");
  };

  const hasRole = (...allowedRoles: string[]): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true; // Admin has superuser access
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        demoLogin,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
