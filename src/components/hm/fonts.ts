import localFont from "next/font/local";

// Brand type (handoff section 4): Syne Bold for the wordmark and two-tone headlines, Shantell Sans for hand-drawn
// notes. Geist and Geist Mono (root layout) carry everything else. Both are variable fonts under the SIL OFL (fonts/OFL.txt), served locally so builds never fetch fonts.

/** Syne: the wordmark and headlines, set Bold (700). */
export const brandFont = localFont({
  src: "./fonts/syne.woff2",
  variable: "--font-syne",
  weight: "400 800",
  display: "swap",
});

/** Shantell Sans: marker-style hand for annotations (the chart's lesson notes). */
export const handFont = localFont({
  src: "./fonts/shantell-sans.woff2",
  variable: "--font-shantell",
  weight: "300 800",
  display: "swap",
  preload: false,
});
