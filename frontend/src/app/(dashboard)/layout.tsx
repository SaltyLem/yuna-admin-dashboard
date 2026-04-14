"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/sidebar";
import { AppHeader } from "@/components/app-header";
import { ModalHost } from "@/components/modal";

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? "http://localhost:4100";
const SIDEBAR_STORAGE_KEY = "sidebar_open";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Restore sidebar preference
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === "1") setSidebarOpen(true);

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

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  if (!ready) return null;

  return (
    <div className="h-dvh flex flex-col">
      <AppHeader onMenuClick={toggleSidebar} />
      <div className="flex flex-1 min-h-0">
        <Sidebar open={sidebarOpen} />
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">{children}</main>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
      <ModalHost />
    </div>
  );
}
