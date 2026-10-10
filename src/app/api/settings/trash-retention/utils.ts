import { readJsonBody } from "@/lib/http/request";
import { updateTrashRetentionSettingsSchema } from "@/lib/validators";
import type { UpdateTrashRetentionSettingsInput } from "./types";

export async function parseUpdateTrashRetentionSettingsRequest(
  request: Request,
): Promise<UpdateTrashRetentionSettingsInput> {
  return updateTrashRetentionSettingsSchema.parse(await readJsonBody(request));
}
