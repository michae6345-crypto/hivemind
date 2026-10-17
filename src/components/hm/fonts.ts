import localFont from "next/font/local";

// Brand type (handoff section 4): Google Sans Flex for the wordmark and two-tone headlines (Adrian's pick on 16 Oct,
// replacing Syne; it's the family spacefs.com uses), Shantell Sans for hand-drawn notes. Geist and Geist Mono (root layout) carry everything else. Both are variable fonts under the SIL OFL (fonts/OFL.txt), served locally so builds never fetch fonts.

/** Google Sans Flex (Latin subset, wght 400–700): the wordmark and headlines, set Medium (500). */
export const brandFont = localFont({
  src: "./fonts/google-sans-flex.woff2",
  variable: "--font-brand-face",
  weight: "400 700",
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
