"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("admin_token");
    if (!saved) {
      setChecking(false);
      return;
    }
    fetch(`${API_URL}/auth/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${saved}` },
    })
      .then((res) => {
        if (res.ok) setToken(saved);
        else localStorage.removeItem("admin_token");
      })
      .catch(() => localStorage.removeItem("admin_token"))
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Invalid password");
        return;
      }
      const data = await res.json();
      localStorage.setItem("admin_token", data.token);
      setToken(data.token);
    } catch {
      setError("Connection failed");
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-neutral-400">
        Loading...
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950">
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-72">
          <h1 className="text-xl font-bold text-white text-center">YUNA Admin</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="px-4 py-2 bg-white text-black rounded font-medium hover:bg-neutral-200 transition"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">YUNA Admin</h1>
        <button
          onClick={() => {
            localStorage.removeItem("admin_token");
            setToken(null);
          }}
          className="text-sm text-neutral-400 hover:text-white transition"
        >
          Logout
        </button>
      </div>
      <p className="text-neutral-400">Dashboard coming soon...</p>
    </div>
  );
}
