import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientUrl = new URL("../app/lib/platform/client.ts", import.meta.url);

test("production builds retain the public live-platform connection", async () => {
  const client = await readFile(clientUrl, "utf8");

  assert.match(
    client,
    /const SHARED_SUPABASE_ORIGIN = "https:\/\/neqvrwtofiolcuxewdze\.supabase\.co"/,
  );
  assert.match(
    client,
    /const SHARED_SUPABASE_PUBLISHABLE_KEY =\s*"sb_publishable_[A-Za-z0-9_-]+"/,
  );
  assert.match(
    client,
    /process\.env\.NEXT_PUBLIC_SUPABASE_URL\?\.trim\(\) \|\| SHARED_SUPABASE_ORIGIN/,
  );
  assert.match(
    client,
    /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\?\.trim\(\) \|\|\s*SHARED_SUPABASE_PUBLISHABLE_KEY/,
  );
  assert.doesNotMatch(
    client,
    /service_role|SUPABASE_SECRET|DATABASE_(?:URL|PASSWORD)/i,
  );
});
