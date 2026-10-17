import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hivemind",
  description:
    "Every correction any engineer gives any AI agent becomes a lesson every agent at the company learns, safely, with a chain of command.",
  openGraph: {
    title: "Hivemind: correct one agent, every agent learns",
    description:
      "Shared memory for AI coding agents. A correction becomes a lesson, a lead approves it, and every agent on the team starts its next session knowing it.",
    siteName: "Hivemind",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
