const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extension = path.join(__dirname, "..", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json")));
const rules = JSON.parse(fs.readFileSync(path.join(extension, "rules.json")));

// A small model of these two static rules, not an implementation of Safari's DNR engine.
function applyRules(href, type = "main_frame") {
  const url = new URL(href);
  url.hash = ""; // Fragments aren't sent in network requests.
  const rule = rules.filter(({ condition }) => condition.resourceTypes.includes(type) &&
    new RegExp(condition.regexFilter, condition.isUrlFilterCaseSensitive ? "" : "i").test(url.href))
    .sort((a, b) => b.priority - a.priority)[0];
  if (rule?.action.type !== "redirect") return null;
  const target = new URL(href);
  for (const { key, value } of rule.action.redirect.transform.queryTransform.addOrReplaceParams) {
    target.searchParams.set(key, value);
  }
  return target.href;
}

test("manifest exposes only Instagram, with no background worker or native messaging", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["declarativeNetRequest"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.instagram.com/*", "https://instagram.com/*"]);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(manifest.content_scripts[0].all_frames, false);
});

test("every resource referenced by the manifest exists", () => {
  const resources = [
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap(({ js, css }) => [...js, ...css]),
    ...manifest.declarative_net_request.rule_resources.map(({ path }) => path)
  ];
  for (const file of resources) assert.ok(fs.existsSync(path.join(extension, file)), file);
  assert.equal(new Set(rules.map(({ id }) => id)).size, rules.length);
});

for (const host of ["www.instagram.com", "instagram.com"]) {
  for (const suffix of ["/", "/?variant=home", "/?foo=bar", "/?variant=favorites", "/?variant=FOLLOWING"]) {
    test(`network rule redirects ${host}${suffix} once, without a loop`, () => {
      const redirected = applyRules(`https://${host}${suffix}`);
      assert.ok(redirected);
      assert.equal(new URL(redirected).searchParams.get("variant"), "following");
      assert.equal(applyRules(redirected), null);
    });
  }
}

test("network redirect preserves other query parameters and the fragment", () => {
  assert.equal(applyRules("https://www.instagram.com/?foo=bar&variant=home#posts"),
    "https://www.instagram.com/?foo=bar&variant=following#posts");
});

for (const suffix of ["/?variant=following", "/?x=1&variant=following", "/?variant=following&x=1", "/?x=1&variant=following&y=2"]) {
  test(`network rules allow Following: ${suffix}`, () => {
    assert.equal(applyRules(`https://www.instagram.com${suffix}`), null);
  });
}

for (const href of [
  "https://www.instagram.com/someone/", "https://www.instagram.com/p/abc/",
  "https://www.instagram.com/explore/", "https://www.instagram.com/reels/",
  "https://www.instagram.com/accounts/login/?next=/", "https://www.instagram.com/direct/inbox/",
  "https://www.instagram.com/api/v1/feed/timeline/", "https://example.com/",
  "https://www.instagram.com.evil.example/", "https://help.instagram.com/"
]) {
  test(`network rules leave other pages alone: ${href}`, () => {
    assert.equal(applyRules(href), null);
  });
}

test("network rules never redirect API calls, scripts or subframes", () => {
  for (const type of ["xmlhttprequest", "script", "sub_frame", "image"]) {
    assert.equal(applyRules("https://www.instagram.com/?variant=home", type), null);
  }
});
