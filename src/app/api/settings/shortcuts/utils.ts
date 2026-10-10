import { readJsonBody } from "@/lib/http/request";
import { updateShortcutsSettingsSchema } from "@/lib/validators";
import type { UpdateShortcutsSettingsInput } from "./types";

export async function parseUpdateShortcutsSettingsRequest(
  request: Request,
): Promise<UpdateShortcutsSettingsInput> {
  return updateShortcutsSettingsSchema.parse(await readJsonBody(request));
}
