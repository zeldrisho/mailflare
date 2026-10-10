import { readJsonBody } from "@/lib/http/request";
import { changePasswordSchema } from "@/lib/validators";
import type { ChangePasswordInput } from "./types";

export async function parseChangePasswordRequest(request: Request): Promise<ChangePasswordInput> {
  const body = await readJsonBody(request);

  return changePasswordSchema.parse(body);
}
