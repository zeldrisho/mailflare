import { RequestBodyTooLargeError } from "./errors";

export const DEFAULT_JSON_BODY_LIMIT = 1024 * 1024;

export async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<ArrayBuffer> {
  if (!stream) return new ArrayBuffer(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      size += value.byteLength;

      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError("Request body is too large");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body.buffer;
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  assertRequestSize(request, maxBytes);

  return readBoundedStream(request.body, maxBytes);
}

export async function readJsonBody<T = Awaited<ReturnType<Request["json"]>>>(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT,
): Promise<T> {
  const body = await readBoundedBody(request, maxBytes);

  if (body.byteLength === 0) {
    // SAFETY: callers use an empty object as the established empty-JSON payload.
    return {} as T;
  }

  // SAFETY: the generic type is selected by the caller; runtime schema validation remains its responsibility.
  return JSON.parse(new TextDecoder().decode(body)) as T;
}

export function assertRequestSize(request: Request, maxBytes: number): void {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new RequestBodyTooLargeError("Request body is too large");
}

export async function readFormDataBody(request: Request, maxBytes: number): Promise<FormData> {
  const body = await readBoundedBody(request, maxBytes);

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  }).formData();
}
