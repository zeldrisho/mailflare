import { readJsonBody } from "@/lib/http/request";
import { updateForwardingEmailSchema } from "@/lib/validators";
import type { UpdateForwardingEmailInput } from "./types";

export async function parseUpdateForwardingEmailRequest(
  request: Request,
): Promise<UpdateForwardingEmailInput> {
  return updateForwardingEmailSchema.parse(await readJsonBody(request));
}
