"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`${API_URL}/auth/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem("admin_token");
          document.cookie = "admin_token=; path=/; max-age=0";
          router.push("/login");
        } else {
          setReady(true);
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Sidebar />
      <main className="ml-56 p-8">{children}</main>
    </div>
  );
}
