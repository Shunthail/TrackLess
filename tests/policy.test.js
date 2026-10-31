import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog, categories } from "../src/core/catalog.js";
import {
  hostname,
  normalizeDomain,
  defaultSettings,
  sanitizeSettings,
  updateSettings,
  decision,
  chromeRules,
  rulesEqual,
  findTracker,
} from "../src/core/policy.js";
import { recent, summarize } from "../src/core/activity.js";

test("catalog IDs and domain boundaries are unambiguous", () => {
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length);
  assert.equal(
    new Set(catalog.map((item) => item.domain)).size,
    catalog.length,
  );
  for (const item of catalog) {
    assert.ok(Object.hasOwn(categories, item.category));
    assert.equal(normalizeDomain(item.domain), item.domain);
    assert.equal(new URL(item.source).protocol, "https:");
  }
  assert.equal(
    findTracker("https://region.google-analytics.com/collect")?.id,
    1,
  );
  assert.equal(
    findTracker("https://google-analytics.com.evil.example/collect"),
    null,
  );
  assert.equal(findTracker("https://notgoogle-analytics.com/collect"), null);
  assert.equal(
    findTracker("https://example.com/path/google-analytics.com"),
    null,
  );
});

test("only supported network URLs are inspected", () => {
  assert.equal(hostname("https://EXAMPLE.com./page?q=private"), "example.com");
  assert.equal(hostname("wss://example.com/socket"), "example.com");
  assert.equal(hostname("file:///tmp/file"), null);
  assert.equal(hostname("chrome://settings"), null);
  assert.equal(findTracker("not a URL"), null);
});

test("exceptions accept domains but reject paths and URL credentials", () => {
  assert.equal(normalizeDomain(" EXAMPLE.com. "), "example.com");
  assert.equal(normalizeDomain("café.fr"), "xn--caf-dma.fr");
  for (const input of [
    "https://example.com",
    "user@example.com",
    "example.com/path",
    "*.example.com",
    "a..com",
    "-bad.com",
    "a".repeat(64) + ".com",
    "a b.com",
    "",
    null,
  ]) {
    assert.throws(() => normalizeDomain(input));
  }
});

test("network resources are blocked while top-level navigation stays available", () => {
  const settings = defaultSettings();
  assert.equal(
    decision(
      "https://fpjscdn.net/v4/public-key",
      "example.com",
      "script",
      settings,
    )?.category,
    "fingerprinting",
  );
  assert.equal(
    decision(
      "https://google-analytics.com/collect",
      "example.com",
      "xmlhttprequest",
      settings,
    )?.id,
    1,
  );
  assert.equal(
    decision(
      "https://google-analytics.com/",
      "example.com",
      "main_frame",
      settings,
    ),
    null,
  );
  assert.equal(
    decision(
      "https://cdn.example.com/app.js",
      "example.com",
      "script",
      settings,
    ),
    null,
  );
});

test("global and category switches affect both engines", () => {
  const initial = defaultSettings();
  const paused = updateSettings(initial, { type: "enabled", value: false });
  assert.equal(
    decision("https://fpjscdn.net/script", "example.com", "script", paused),
    null,
  );
  assert.deepEqual(chromeRules(paused), []);
  const filtered = updateSettings(initial, {
    type: "category",
    category: "fingerprinting",
    value: false,
  });
  assert.equal(
    decision("https://fpjscdn.net/script", "example.com", "script", filtered),
    null,
  );
  assert.ok(chromeRules(filtered).every((rule) => rule.id < 201));
  assert.equal(initial.enabled, true);
  assert.equal(initial.categories.fingerprinting, true);
});

test("exceptions cover subdomains without matching a deceptive suffix", () => {
  const allowed = updateSettings(defaultSettings(), {
    type: "allow",
    domain: "example.com",
  });
  assert.equal(
    decision(
      "https://fpjscdn.net/agent.js",
      "sub.example.com",
      "script",
      allowed,
    ),
    null,
  );
  assert.ok(
    decision(
      "https://fpjscdn.net/agent.js",
      "notexample.com",
      "script",
      allowed,
    ),
  );
  const rules = chromeRules(allowed);
  assert.equal(rules.find((rule) => rule.id === 10001).action.type, "allow");
  assert.equal(
    rules.find((rule) => rule.id === 10002).action.type,
    "allowAllRequests",
  );
  assert.ok(
    rules
      .filter((rule) => rule.action.type === "block")
      .every((rule) => !rule.condition.resourceTypes.includes("main_frame")),
  );
  assert.deepEqual(
    updateSettings(allowed, { type: "remove", domain: "example.com" })
      .exceptions,
    [],
  );
});

test("persisted settings are sanitized and the exception count is bounded", () => {
  const settings = sanitizeSettings({
    enabled: "yes",
    categories: { analytics: false, other: true },
    exceptions: ["EXAMPLE.COM", "example.com", "https://invalid.com", null],
  });
  assert.equal(settings.enabled, true);
  assert.equal(settings.categories.analytics, false);
  assert.deepEqual(settings.exceptions, ["example.com"]);
  const full = sanitizeSettings({
    exceptions: Array.from({ length: 101 }, (_, i) => `site${i}.example`),
  });
  assert.equal(full.exceptions.length, 100);
  assert.throws(() =>
    updateSettings(full, { type: "allow", domain: "new.example" }),
  );
  assert.throws(() =>
    updateSettings(settings, {
      type: "category",
      category: "__proto__",
      value: false,
    }),
  );
  assert.deepEqual(
    updateSettings(settings, { type: "reset" }),
    defaultSettings(),
  );
});

test("native rule reordering does not trigger unnecessary rule replacement", () => {
  const rules = chromeRules(defaultSettings());
  const reordered = rules
    .map((rule) => ({
      condition: {
        resourceTypes: [...rule.condition.resourceTypes].reverse(),
        requestDomains: rule.condition.requestDomains,
      },
      action: rule.action,
      priority: rule.priority,
      id: rule.id,
    }))
    .reverse();
  assert.ok(rulesEqual(rules, reordered));
  assert.equal(rulesEqual(rules, []), false);
});

test("activity excludes expired, future, unknown and cleared records", () => {
  const now = 1000000;
  const records = [
    { ruleId: 1, timeStamp: now },
    { ruleId: 201, timeStamp: now - 10 },
    { ruleId: 1, timeStamp: now - 300001 },
    { ruleId: 1, timeStamp: now + 1 },
    { ruleId: 10001, timeStamp: now },
  ];
  const stats = summarize(records, now);
  assert.equal(stats.total, 2);
  assert.equal(stats.domains, 2);
  assert.equal(stats.groups[0].domain, "google-analytics.com");
  assert.equal(summarize(records, now, now - 1).total, 1);
  assert.deepEqual(summarize([], now).groups, []);
});

test("activity is bounded and never retains full URLs or request bodies", () => {
  const now = Date.now();
  const records = Array.from({ length: 600 }, () => ({
    ruleId: 1,
    timeStamp: now,
    url: "https://example.com/private?token=synthetic-test-value",
    requestBody: "private",
  }));
  assert.equal(recent(records, now).length, 500);
  assert.deepEqual(Object.keys(recent(records, now)[0]).sort(), [
    "ruleId",
    "timeStamp",
  ]);
  const stats = summarize(records, now);
  assert.equal(stats.limited, true);
  assert.equal(stats.groups[0].count, 500);
  assert.doesNotMatch(
    JSON.stringify(stats),
    /synthetic-test-value|requestBody/,
  );
});
