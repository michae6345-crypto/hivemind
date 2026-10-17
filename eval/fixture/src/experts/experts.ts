import { query } from "../db";
import type { Expert } from "./types";

export async function getExpert(id: string): Promise<Expert | undefined> {
  const [row] = await query<Expert>("select * from experts where id = $1", [id]);
  return row;
}

export async function saveExpert(expert: Expert): Promise<void> {
  await query("update experts set name = $2, email = $3, phone = $4 where id = $1", [
    expert.id,
    expert.name,
    expert.email,
    expert.phone,
  ]);
}
