import { readJsonBody } from "@/lib/http/request";
import { updateProfileSchema } from "@/lib/validators";
import type { UpdateProfileInput } from "./types";

export async function parseUpdateProfileRequest(request: Request): Promise<UpdateProfileInput> {
  const body = await readJsonBody(request);

  return updateProfileSchema.parse(body);
}
