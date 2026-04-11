import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YUNA Admin",
  description: "YUNA Admin Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-neutral-950 text-white antialiased">{children}</body>
    </html>
  );
}
