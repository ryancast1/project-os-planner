import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project OS",
  description: "Personal planner + trackers",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-neutral-50 text-neutral-900">
        {children}
      </body>
    </html>
  );
}