import assert from "node:assert/strict";
import { test } from "node:test";
import { createController } from "../src/background/controller.js";
import { defaultSettings } from "../src/core/policy.js";

function browserStub(initialSettings = defaultSettings()) {
  const state = {
    local: { settings: structuredClone(initialSettings) },
    session: {},
    rules: [],
    updates: 0,
    badge: "",
    nativeMatches: [],
    failSave: false,
  };
  const api = {
    storage: {
      local: {
        get: async () => structuredClone(state.local),
        set: async (value) => {
          if (state.failSave) throw new Error("storage failed");
          Object.assign(state.local, structuredClone(value));
        },
      },
      session: {
        get: async () => structuredClone(state.session),
        set: async (value) =>
          Object.assign(state.session, structuredClone(value)),
      },
    },
    action: {
      setBadgeText: async ({ text }) => {
        state.badge = text;
      },
      setBadgeBackgroundColor: async () => {},
    },
    tabs: {
      get: async (id) => ({
        id,
        url: "https://example.com/article?private=not-recorded",
      }),
    },
    declarativeNetRequest: {
      getDynamicRules: async () => structuredClone(state.rules),
      updateDynamicRules: async ({ removeRuleIds, addRules }) => {
        state.updates++;
        state.rules = state.rules
          .filter((rule) => !removeRuleIds.includes(rule.id))
          .concat(structuredClone(addRules));
      },
      getMatchedRules: async (filter) => {
        state.filter = filter;
        return {
          rulesMatchedInfo: state.nativeMatches.filter(
            (item) =>
              item.tabId === filter.tabId &&
              item.timeStamp >= filter.minTimeStamp,
          ),
        };
      },
    },
  };
  return { api, state };
}

const details = () => ({
  tabId: 7,
  type: "script",
  url: "https://google-analytics.com/agent.js?token=synthetic-test-value",
});

test("Chromium installs rules once and restores persisted pause state", async () => {
  const { api, state } = browserStub();
  await createController(api, "chrome").ready;
  const installedCount = state.updates;
  await createController(api, "chrome").ready;
  assert.equal(state.updates, installedCount);
  const controller = createController(api, "chrome");
  await controller.change({ type: "enabled", value: false });
  assert.deepEqual(state.rules, []);
  assert.equal(state.badge, "OFF");
  await createController(api, "chrome").ready;
  assert.deepEqual(state.rules, []);
});

test("concurrent setting changes are serialized without losing updates", async () => {
  const { api } = browserStub();
  const controller = createController(api, "chrome");
  await Promise.all([
    controller.change({ type: "enabled", value: false }),
    controller.change({
      type: "category",
      category: "analytics",
      value: false,
    }),
    controller.change({ type: "allow", domain: "example.org" }),
  ]);
  const settings = await controller.getSettings();
  assert.equal(settings.enabled, false);
  assert.equal(settings.categories.analytics, false);
  assert.deepEqual(settings.exceptions, ["example.org"]);
});

test("failed settings persistence rolls back native blocking rules", async () => {
  const { api, state } = browserStub();
  const controller = createController(api, "chrome");
  await controller.ready;
  const initial = structuredClone(state.rules);
  state.failSave = true;
  await assert.rejects(
    controller.change({ type: "enabled", value: false }),
    /storage failed/,
  );
  assert.deepEqual(state.rules, initial);
  assert.equal((await controller.getSettings()).enabled, true);
});

test("Chromium uses native matched rules for the current tab only", async () => {
  const { api, state } = browserStub();
  const now = Date.now();
  state.nativeMatches = [
    { tabId: 7, timeStamp: now, rule: { ruleId: 1, rulesetId: "_dynamic" } },
    {
      tabId: 7,
      timeStamp: now,
      rule: { ruleId: 10001, rulesetId: "_dynamic" },
    },
    { tabId: 9, timeStamp: now, rule: { ruleId: 201, rulesetId: "_dynamic" } },
  ];
  const controller = createController(api, "chrome");
  const snapshot = await controller.snapshot({
    id: 7,
    url: "https://example.com",
  });
  assert.equal(snapshot.activity.total, 1);
  assert.equal(snapshot.activity.domains, 1);
  assert.equal(state.filter.tabId, 7);
  await controller.clear(7);
  assert.equal(
    (await controller.snapshot({ id: 7, url: "https://example.com" })).activity
      .total,
    0,
  );
});

test("Firefox cancels matching requests and keeps only temporary rule metadata", async () => {
  const { api, state } = browserStub();
  const controller = createController(api, "firefox");
  assert.deepEqual(await controller.beforeRequest(details()), { cancel: true });
  assert.deepEqual(
    await controller.beforeRequest({
      ...details(),
      url: "https://cdn.example.com/script.js",
    }),
    { cancel: false },
  );
  assert.deepEqual(
    await controller.beforeRequest({ ...details(), tabId: -1 }),
    { cancel: true },
  );
  const snapshot = await controller.snapshot({
    id: 7,
    url: "https://example.com",
  });
  assert.equal(snapshot.activity.total, 1);
  assert.doesNotMatch(JSON.stringify(state.session), /token=|private=|https:/);
  const restored = createController(api, "firefox");
  assert.equal(
    (await restored.snapshot({ id: 7, url: "https://example.com" })).activity
      .total,
    1,
  );
});

test("Firefox respects pauses and site exceptions before recording blocks", async () => {
  const { api } = browserStub();
  const controller = createController(api, "firefox");
  await controller.change({ type: "allow", domain: "example.com" });
  assert.deepEqual(await controller.beforeRequest(details()), {
    cancel: false,
  });
  await controller.change({ type: "remove", domain: "example.com" });
  await controller.change({ type: "enabled", value: false });
  assert.deepEqual(await controller.beforeRequest(details()), {
    cancel: false,
  });
  assert.equal(
    (await controller.snapshot({ id: 7, url: "https://example.com" })).activity
      .total,
    0,
  );
});

test("Firefox records concurrent blocks without losing events and clears closed tabs", async () => {
  const { api, state } = browserStub();
  const controller = createController(api, "firefox");
  const responses = await Promise.all(
    Array.from({ length: 30 }, () => controller.beforeRequest(details())),
  );
  assert.ok(responses.every((response) => response.cancel));
  assert.equal(
    (await controller.snapshot({ id: 7, url: "https://example.com" })).activity
      .total,
    30,
  );
  await controller.removeTab(7);
  assert.equal(
    (await controller.snapshot({ id: 7, url: "https://example.com" })).activity
      .total,
    0,
  );
  assert.equal(state.session.activity[7], undefined);
});

test("unsupported pages do not invent a host or blocked requests", async () => {
  const { api } = browserStub();
  const controller = createController(api, "chrome");
  const snapshot = await controller.snapshot({
    id: 7,
    url: "chrome://extensions",
  });
  assert.equal(snapshot.host, null);
  assert.equal(snapshot.activity.total, 0);
});

test("a failed activity write never disables Firefox blocking", async () => {
  const { api } = browserStub();
  const controller = createController(api, "firefox");
  await controller.ready;
  api.storage.session.set = async () => {
    throw new Error("storage unavailable");
  };
  assert.deepEqual(await controller.beforeRequest(details()), { cancel: true });
});
