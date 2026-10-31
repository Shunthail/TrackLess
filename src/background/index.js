import { createController } from "./controller.js";
const api = globalThis.browser || globalThis.chrome;
const controller = createController(api, __BROWSER__);
controller.ready.catch(() =>
  console.error("TrackLess: impossible de préparer les règles."),
);

if (__BROWSER__ === "firefox")
  api.webRequest.onBeforeRequest.addListener(
    (details) => controller.beforeRequest(details),
    {
      urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"],
      types: [
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
      ],
    },
    ["blocking"],
  );

api.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== api.runtime.id) return false;
  const run = async () => {
    if (message?.type === "settings") return controller.getSettings();
    if (message?.type === "change") return controller.change(message.action);
    if (message?.type === "snapshot") {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      return controller.snapshot(tab);
    }
    if (message?.type === "clear") {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      await controller.clear(tab?.id);
      return null;
    }
    throw new Error("Requête inconnue.");
  };
  run().then(
    (data) => reply({ ok: true, data }),
    (error) =>
      reply({ ok: false, error: error?.message || "Action indisponible." }),
  );
  return true;
});
api.tabs.onRemoved.addListener((id) => {
  controller.removeTab(id).catch(() => {});
});
api.tabs.onUpdated.addListener((id, change) => {
  if (change.url) controller.navigated(id, change.url).catch(() => {});
});
