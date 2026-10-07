import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiUrl } from "./api-url.ts";

test("relative browser base uses the page origin", () => {
  const url = resolveApiUrl(
    "/api/v1",
    "/admin/users",
    "https://admin.namat.shara.sa",
  );
  assert.equal(
    url.href,
    "https://admin.namat.shara.sa/api/v1/admin/users",
  );
});

test("absolute internal base does not need a browser origin", () => {
  const url = resolveApiUrl("http://api:3302/api/v1", "me");
  assert.equal(url.href, "http://api:3302/api/v1/me");
});

test("new URL without an origin rejects a relative base", () => {
  assert.throws(() => new URL("/api/v1/me"));
});
