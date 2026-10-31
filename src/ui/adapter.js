const api = globalThis.browser || globalThis.chrome;
export const installed = Boolean(api?.runtime?.id);

export async function send(type, data = {}) {
  if (!installed)
    throw new Error(
      "Ouvre TrackLess depuis la barre d’outils du navigateur pour activer ces commandes.",
    );
  const response = await api.runtime.sendMessage({ type, ...data });
  if (!response?.ok)
    throw new Error(response?.error || "L’extension ne répond pas.");
  return response.data;
}

export async function reloadTab() {
  if (!installed) return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (Number.isInteger(tab?.id)) await api.tabs.reload(tab.id);
}

export function openOptions() {
  return installed
    ? api.runtime.openOptionsPage()
    : Promise.resolve(location.assign("options.html"));
}
