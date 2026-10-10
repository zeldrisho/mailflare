import { execFileSync } from "node:child_process";

const databaseName = "mailflare";

const databases = JSON.parse(
  execFileSync("vp", ["exec", "cf", "d1", "list"], { encoding: "utf8" }),
);

const database = databases.find((entry) => entry.name === databaseName);

if (!database?.uuid) {
  throw new Error(`Cloudflare D1 database not found: ${databaseName}`);
}

const local = process.argv.includes("--local");

execFileSync(
  "vp",
  [
    "exec",
    "cf",
    "d1",
    "migrations",
    "apply",
    database.uuid,
    "--dir",
    "drizzle/migrations",
    ...(local ? ["--local"] : []),
  ],
  { stdio: "inherit" },
);
