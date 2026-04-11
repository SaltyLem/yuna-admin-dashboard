"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

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
      document.cookie = `admin_token=${data.token}; path=/; max-age=86400`;
      router.push("/");
    } catch {
      setError("Connection failed");
    }
  };

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
