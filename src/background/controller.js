import {
  chromeRules,
  decision,
  findTracker,
  hostname,
  sanitizeSettings,
  updateSettings,
  isExcepted,
  rulesEqual,
} from "../core/policy.js";
import { recent, summarize } from "../core/activity.js";

export function createController(api, target) {
  let settings;
  let activity = {};
  let cleared = {};
  let queue = Promise.resolve();
  const serial = (task) => {
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  };
  const persistSession = () => api.storage.session.set({ activity, cleared });

  async function apply(next) {
    if (target === "chrome") {
      const current = await api.declarativeNetRequest.getDynamicRules();
      const desired = chromeRules(next);
      if (!rulesEqual(current, desired))
        await api.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: current.map((rule) => rule.id),
          addRules: desired,
        });
    }
    await api.action.setBadgeText({ text: next.enabled ? "" : "OFF" });
    await api.action.setBadgeBackgroundColor({ color: "#695580" });
  }

  const ready = (async () => {
    const [local, session] = await Promise.all([
      api.storage.local.get("settings"),
      api.storage.session.get(["activity", "cleared"]),
    ]);
    settings = sanitizeSettings(local.settings);
    activity =
      session.activity && typeof session.activity === "object"
        ? session.activity
        : {};
    cleared =
      session.cleared && typeof session.cleared === "object"
        ? session.cleared
        : {};
    for (const tabId of Object.keys(activity))
      activity[tabId] = recent(activity[tabId]);
    await apply(settings);
  })();

  async function getSettings() {
    await ready;
    return structuredClone(settings);
  }

  async function change(action) {
    await ready;
    return serial(async () => {
      const previous = settings;
      const next = updateSettings(previous, action);
      await apply(next);
      try {
        await api.storage.local.set({ settings: next });
      } catch (error) {
        await apply(previous);
        throw error;
      }
      settings = next;
      return structuredClone(settings);
    });
  }

  async function beforeRequest(details) {
    if (!findTracker(details.url)) return { cancel: false };
    await ready;
    let topHost = hostname(details.documentUrl || details.originUrl);
    if (details.tabId >= 0) {
      try {
        topHost = hostname((await api.tabs.get(details.tabId)).url);
      } catch {
        return { cancel: false };
      }
    }
    const tracker = decision(details.url, topHost, details.type, settings);
    if (!tracker) return { cancel: false };
    if (details.tabId < 0) return { cancel: true };
    try {
      await serial(async () => {
        activity[details.tabId] = recent([
          { ruleId: tracker.id, timeStamp: Date.now() },
          ...(activity[details.tabId] || []),
        ]);
        await persistSession();
      });
    } catch {
      // A failed activity write must not let a tracker through.
    }
    return { cancel: true };
  }

  async function snapshot(tab) {
    await ready;
    const host = hostname(tab?.url);
    let records = [];
    if (Number.isInteger(tab?.id) && host) {
      if (target === "chrome") {
        const time = Math.max(Date.now() - 300000, cleared[tab.id] || 0);
        const result = await api.declarativeNetRequest.getMatchedRules({
          tabId: tab.id,
          minTimeStamp: time,
        });
        records = result.rulesMatchedInfo
          .filter((item) => item.rule.rulesetId === "_dynamic")
          .map((item) => ({
            ruleId: item.rule.ruleId,
            timeStamp: item.timeStamp,
          }));
      } else records = activity[tab.id] || [];
    }
    return {
      settings: structuredClone(settings),
      host,
      tabId: tab?.id ?? null,
      excepted: isExcepted(host, settings),
      activity: summarize(records, Date.now(), cleared[tab?.id] || 0),
    };
  }

  async function clear(tabId) {
    await ready;
    if (!Number.isInteger(tabId) || tabId < 0)
      throw new Error("Aucun onglet à réinitialiser.");
    return serial(async () => {
      delete activity[tabId];
      cleared[tabId] = Date.now() + 1;
      await persistSession();
    });
  }

  async function removeTab(tabId) {
    await ready;
    return serial(async () => {
      delete activity[tabId];
      delete cleared[tabId];
      await persistSession();
    });
  }

  async function navigated(tabId, url) {
    if (!hostname(url)) return;
    await clear(tabId);
  }

  return {
    ready,
    getSettings,
    change,
    beforeRequest,
    snapshot,
    clear,
    removeTab,
    navigated,
  };
}
