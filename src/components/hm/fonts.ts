import localFont from "next/font/local";

// Brand type (see the logo canvas): Anybody for display, Shantell Sans for hand-written notes.
// Both are variable fonts under the SIL OFL (fonts/OFL.txt), served locally so builds never fetch fonts.

/** Anybody: variable weight and width, used expanded for the wordmark and headings. */
export const displayFont = localFont({
  src: "./fonts/anybody.woff2",
  variable: "--font-anybody",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "50% 150%" }],
});

/** Shantell Sans: marker-style hand for annotations (the chart's lesson notes). */
export const handFont = localFont({
  src: "./fonts/shantell-sans.woff2",
  variable: "--font-shantell",
  weight: "300 800",
  display: "swap",
  preload: false,
});
