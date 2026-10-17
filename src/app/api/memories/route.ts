import type { NextRequest } from "next/server";
import { err, json } from "@/lib/auth";
import { listMemories } from "@/lib/queries";

/** GET /api/memories?scope=&chain=1&status=pending,active&q= → { memories } */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const memories = await listMemories({
      scope: p.get("scope"),
      chain: p.get("chain") === "1" || p.get("chain") === "true",
      status: p.get("status"),
      q: p.get("q"),
    });
    return json({ memories });
  } catch (e) {
    return err((e as Error).message, 500);
  }
}
