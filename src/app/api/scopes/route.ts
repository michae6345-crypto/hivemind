import { connection } from "next/server";
import { err, json } from "@/lib/auth";
import { getPeople, getScopes } from "@/lib/queries";

/** GET /api/scopes → { scopes, people } */
export async function GET() {
  await connection();
  try {
    const [scopes, people] = await Promise.all([getScopes(), getPeople()]);
    return json({ scopes, people });
  } catch (e) {
    return err((e as Error).message, 500);
  }
}
