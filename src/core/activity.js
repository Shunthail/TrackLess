import { catalogById } from "./catalog.js";
export const windowMs = 5 * 60 * 1000;
export const maxRecords = 500;

export function recent(records, now = Date.now(), clearedAt = 0) {
  return (Array.isArray(records) ? records : [])
    .filter(
      (record) =>
        catalogById.has(record.ruleId) &&
        Number.isFinite(record.timeStamp) &&
        record.timeStamp >= Math.max(now - windowMs, clearedAt) &&
        record.timeStamp <= now,
    )
    .map(({ ruleId, timeStamp }) => ({ ruleId, timeStamp }))
    .sort((a, b) => b.timeStamp - a.timeStamp)
    .slice(0, maxRecords);
}

export function summarize(records, now = Date.now(), clearedAt = 0) {
  const entries = recent(records, now, clearedAt);
  const groups = new Map();
  for (const entry of entries) {
    const item = catalogById.get(entry.ruleId);
    const group = groups.get(item.id) || {
      ...item,
      count: 0,
      lastSeen: entry.timeStamp,
    };
    group.count++;
    groups.set(item.id, group);
  }
  return {
    total: entries.length,
    domains: groups.size,
    limited: entries.length === maxRecords,
    groups: [...groups.values()].sort((a, b) => b.lastSeen - a.lastSeen),
  };
}
