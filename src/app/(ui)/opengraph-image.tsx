import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Link-preview card for Devpost, Slack and iMessage: the website's hero line in Syne Bold on the light palette.
// Satori can't read woff2 or variable fonts, so syne-bold-og.ttf is syne.woff2 pinned at wght 700 (fontTools).

export const alt = "Hivemind: correct one agent, every agent learns.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path d="M60 13L84.25 27L84.25 55L60 69L35.75 55L35.75 27Z" fill="#FB7185"/><path d="M38 51.1L62.25 65.1L62.25 93.1L38 107.1L13.75 93.1L13.75 65.1Z" fill="#F5A524"/><path d="M82 52.7L104.86 65.9L104.86 92.3L82 105.5L59.14 92.3L59.14 65.9Z" fill="none" stroke="#B86E00" stroke-width="1.6" stroke-dasharray="3.6 2.6" stroke-linejoin="round"/></svg>`,
  );

export default async function Image() {
  const syne = await readFile(join(process.cwd(), "src/components/hm/fonts/syne-bold-og.ttf"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px",
          background: "#f7f8fa",
          backgroundImage: "radial-gradient(#d5d9e0 1.4px, transparent 1.4px)",
          backgroundSize: "22px 22px",
          color: "#0e0f12",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={64} height={64} alt="" />
          <div style={{ fontFamily: "Syne", fontSize: 40 }}>hivemind</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontFamily: "Syne", fontSize: 92, lineHeight: 1.04 }}>
          <div>Correct one agent.</div>
          <div style={{ color: "#686d78" }}>Every agent learns.</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#686d78" }}>
          Shared memory for every AI coding agent on your team
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Syne", data: syne, weight: 700, style: "normal" }] },
  );
}
