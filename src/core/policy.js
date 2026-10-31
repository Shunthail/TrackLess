import { catalog, categories } from "./catalog.js";

export const resourceTypes = [
  "script",
  "xmlhttprequest",
  "image",
  "ping",
  "sub_frame",
  "websocket",
  "other",
  "media",
  "font",
  "stylesheet",
];
export const defaultSettings = () => ({
  enabled: true,
  categories: Object.fromEntries(
    Object.keys(categories).map((key) => [key, true]),
  ),
  exceptions: [],
});

export function hostname(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      ? url.hostname.toLowerCase().replace(/\.$/, "")
      : null;
  } catch {
    return null;
  }
}

export function normalizeDomain(input) {
  if (typeof input !== "string") throw new Error("Saisissez un domaine.");
  const value = input.trim().toLowerCase();
  if (!value || /[\s/@?#:*\\]/.test(value) || value.length > 253)
    throw new Error(
      "Indiquez uniquement le domaine, sans protocole ni chemin.",
    );
  const domain = hostname("https://" + value);
  if (
    !domain ||
    !/^[a-z0-9.-]+$/.test(domain) ||
    domain.startsWith(".") ||
    domain.includes("..") ||
    domain
      .split(".")
      .some(
        (label) =>
          !label ||
          label.startsWith("-") ||
          label.endsWith("-") ||
          label.length > 63,
      )
  )
    throw new Error("Ce domaine n’est pas valide.");
  return domain;
}

export const domainMatches = (host, domain) =>
  host === domain || host.endsWith("." + domain);
export const isExcepted = (host, settings) =>
  Boolean(
    host && settings.exceptions.some((domain) => domainMatches(host, domain)),
  );
export const findTracker = (url) => {
  const host = hostname(url);
  return host
    ? catalog.find((item) => domainMatches(host, item.domain)) || null
    : null;
};

export function sanitizeSettings(value) {
  const settings = defaultSettings();
  if (!value || typeof value !== "object") return settings;
  if (typeof value.enabled === "boolean") settings.enabled = value.enabled;
  for (const category of Object.keys(categories))
    if (typeof value.categories?.[category] === "boolean")
      settings.categories[category] = value.categories[category];
  if (Array.isArray(value.exceptions))
    settings.exceptions = [
      ...new Set(
        value.exceptions.flatMap((input) => {
          try {
            return [normalizeDomain(input)];
          } catch {
            return [];
          }
        }),
      ),
    ].slice(0, 100);
  return settings;
}

export function updateSettings(previous, action) {
  const settings = sanitizeSettings(previous);
  if (action.type === "enabled" && typeof action.value === "boolean")
    settings.enabled = action.value;
  else if (
    action.type === "category" &&
    Object.hasOwn(categories, action.category) &&
    typeof action.value === "boolean"
  )
    settings.categories[action.category] = action.value;
  else if (["allow", "remove"].includes(action.type)) {
    const domain = normalizeDomain(action.domain);
    if (action.type === "remove")
      settings.exceptions = settings.exceptions.filter(
        (item) => item !== domain,
      );
    else if (!settings.exceptions.includes(domain)) {
      if (settings.exceptions.length >= 100)
        throw new Error("La limite de 100 exceptions est atteinte.");
      settings.exceptions.push(domain);
    }
  } else if (action.type === "reset") return defaultSettings();
  else throw new Error("Réglage invalide.");
  return settings;
}

export function decision(url, topHost, type, settings) {
  const tracker = findTracker(url);
  if (
    !tracker ||
    !resourceTypes.includes(type) ||
    !settings.enabled ||
    !settings.categories[tracker.category] ||
    isExcepted(topHost, settings)
  )
    return null;
  return tracker;
}

export function chromeRules(settings) {
  if (!settings.enabled) return [];
  const rules = catalog
    .filter((item) => settings.categories[item.category])
    .map((item) => ({
      id: item.id,
      priority: 1,
      action: { type: "block" },
      condition: { requestDomains: [item.domain], resourceTypes },
    }));
  if (settings.exceptions.length) {
    rules.push({
      id: 10001,
      priority: 100,
      action: { type: "allow" },
      condition: { initiatorDomains: settings.exceptions, resourceTypes },
    });
    rules.push({
      id: 10002,
      priority: 100,
      action: { type: "allowAllRequests" },
      condition: {
        requestDomains: settings.exceptions,
        resourceTypes: ["main_frame", "sub_frame"],
      },
    });
  }
  return rules;
}

export function rulesEqual(left, right) {
  const canonical = (value) => {
    if (Array.isArray(value))
      return value
        .map(canonical)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      );
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
