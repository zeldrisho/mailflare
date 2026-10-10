import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, test } from "vite-plus/test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const patchedBracesDir = readdirSync(join(root, "node_modules/.pnpm")).find((name) =>
  name.startsWith("braces@3.0.3_patch_hash="),
);
assert.ok(patchedBracesDir, "patched braces dependency must be installed");
const braces = require(join(root, "node_modules/.pnpm", patchedBracesDir, "node_modules/braces"));
const directory = mkdtempSync(join(root, "node_modules", "mailflare-security-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
await build({
  stdin: {
    contents: `
      export { formatEmailAddress, parseEmailAddressParts } from "./src/lib/email/address.ts";
      export { calendarInvitationBytes, isValidCalendarAttendee } from "./src/lib/calendar/utils.ts";
      export { xmlTag, xmlTags, xmlBlocks } from "./src/lib/aws/xml.ts";
    `,
    resolveDir: root,
    sourcefile: "security-regressions-entry.ts",
  },
  outfile: join(directory, "entry.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  tsconfig: join(root, "tsconfig.json"),
  packages: "external",
  logLevel: "silent",
});
const {
  formatEmailAddress,
  parseEmailAddressParts,
  calendarInvitationBytes,
  isValidCalendarAttendee,
  xmlTag,
  xmlTags,
  xmlBlocks,
} = await import(pathToFileURL(join(directory, "entry.mjs")).href);

test("braces rejects adversarial nesting before recursive AST processing", () => {
  assert.throws(() => braces.expand("{".repeat(101) + "x" + "}".repeat(101)), /maximum depth/);
  assert.deepEqual(braces.expand("{a,b}"), ["a", "b"]);
});

test("address formatting removes header control characters and parses quoted names", () => {
  assert.equal(
    formatEmailAddress("user@example.com", "First\r\nBcc: victim@example.com"),
    '"First Bcc: victim@example.com" <user@example.com>',
  );
  assert.deepEqual(parseEmailAddressParts('"Doe, Jane" <jane@example.com>'), {
    name: "Doe, Jane",
    address: "jane@example.com",
  });
});

test("calendar attendee validation is bounded and does not use backtracking regexes", () => {
  assert.equal(isValidCalendarAttendee("a.person@example.com"), true);
  assert.equal(isValidCalendarAttendee("not-an-address"), false);
  assert.equal(isValidCalendarAttendee(`${"a".repeat(255)}@example.com`), false);
  assert.equal(isValidCalendarAttendee("a@b..com"), false);
});

test("calendar attachment bytes have an exact standalone ArrayBuffer", () => {
  const source = new Uint8Array([1, 2, 3, 4]);
  const exact = calendarInvitationBytes(source.subarray(1, 3));
  assert.ok(exact instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(exact)], [2, 3]);
});

test("XML tag helpers reject malformed tag names", () => {
  assert.equal(xmlTag("<Tag>ok</Tag>", "Tag"), "ok");
  assert.deepEqual(xmlTags("<member>a</member>", "member"), ["a"]);
  assert.deepEqual(xmlBlocks("<member><x>a</x></member>", "member"), ["<x>a</x>"]);
  assert.equal(xmlTag("<Tag>ok</Tag>", "Tag.*"), null);
  assert.deepEqual(xmlTags("<member>a</member>", "member|other"), []);
});
