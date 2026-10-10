import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wellness Tech Distribution",
  description: "503A and 503B ordering for licensed practices, with RxHere fulfillment behind one cart.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="icon" href="/images/wellness-tech-logo.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
