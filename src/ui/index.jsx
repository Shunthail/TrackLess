import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { catalog, categories } from "../core/catalog.js";
import { installed, send, reloadTab, openOptions } from "./adapter.js";

const emptyActivity = { total: 0, domains: 0, groups: [], limited: false };
const isOptions = location.pathname.endsWith("options.html");
document.documentElement.dataset.context = location.protocol.endsWith("-extension:") ? "extension" : "web";
document.body.classList.toggle("options-page", isOptions);
const clock = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={"toggle " + (checked ? "on" : "")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [needsReload, setNeedsReload] = useState(false);

  async function refresh() {
    if (!installed) return;
    const data = await send(isOptions ? "settings" : "snapshot");
    setSettings(isOptions ? data : data.settings);
    if (!isOptions) setSnapshot(data);
  }
  useEffect(() => {
    refresh().catch((error) => setError(error.message));
  }, []);

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error.message || "Action indisponible.");
    } finally {
      setBusy(false);
    }
  }
  async function change(action) {
    const next = await send("change", { action });
    setSettings(next);
    setNeedsReload(true);
    if (snapshot)
      setSnapshot({
        ...snapshot,
        settings: next,
        excepted: next.exceptions.some(
          (value) =>
            snapshot.host === value || snapshot.host?.endsWith("." + value),
        ),
      });
  }
  const activity = snapshot?.activity || emptyActivity;
  const paused = !settings?.enabled || snapshot?.excepted;
  const supported = Boolean(snapshot?.host);
  const controlsDisabled = busy || !installed || !settings;
  const groups = activity.groups.filter(
    (group) => filter === "all" || group.category === filter,
  );
  const rules = catalog.filter((item) =>
    `${item.name} ${item.domain} ${categories[item.category].label}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <main className={isOptions ? "options" : "popup"}>
      <header>
        <a className="brand" href="popup.html">
          track<span>less</span>
          <i>✳</i>
        </a>
        <button
          className="help-button"
          aria-label="À propos de la protection"
          aria-expanded={help}
          onClick={() => setHelp(!help)}
        >
          ?
        </button>
      </header>
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <button aria-label="Fermer le message" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {!installed && (
        <div className="install-note">
          Ouvre cette interface depuis l’extension pour accéder au blocage et
          aux relevés de l’onglet.
        </div>
      )}
      {help && (
        <section className="help">
          <h2>Ce qu’on coupe.</h2>
          <p>
            Les requêtes vers les domaines de la liste, y compris leurs
            sous-domaines. Aucun script n’est injecté dans les pages.
          </p>
          <p>
            Les services de fingerprinting connus sont bloqués à leur
            chargement. Les techniques intégrées directement dans un site ne
            sont pas toutes détectées.
          </p>
          <p>
            Réglages sur cet appareil. Relevés temporaires dans la mémoire de
            session du navigateur : ni URL complète, ni cookie, ni contenu de
            page.
          </p>
        </section>
      )}
      <section className="master">
        <div>
          <span className="small-label">LE FILTRE</span>
          <h1>
            {!installed
              ? "Pas encore branché."
              : !settings
                ? "Un instant…"
                : settings.enabled
                  ? "On fait le tri."
                  : "Le filtre est en pause."}
          </h1>
        </div>
        <Toggle
          label="Activer la protection"
          checked={Boolean(settings?.enabled)}
          disabled={controlsDisabled}
          onChange={(value) => run(() => change({ type: "enabled", value }))}
        />
      </section>
      {isOptions ? (
        <>
          <h2 className="section-title">À bloquer</h2>
          <section className="category-settings">
            {Object.entries(categories).map(([key, item]) => (
              <label key={key}>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings?.categories[key])}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    run(() =>
                      change({
                        type: "category",
                        category: key,
                        value: event.target.checked,
                      }),
                    )
                  }
                />
              </label>
            ))}
          </section>
          <section className="exceptions">
            <h2 className="section-title">
              Les sites qu’on laisse tranquilles
            </h2>
            <p>Une exception s’applique au domaine et à ses sous-domaines.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await change({ type: "allow", domain });
                  setDomain("");
                });
              }}
            >
              <label className="sr-only" htmlFor="domain">
                Domaine à autoriser
              </label>
              <input
                id="domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="exemple.fr"
                maxLength={253}
                disabled={controlsDisabled}
                required
              />
              <button disabled={controlsDisabled}>Ajouter +</button>
            </form>
            {settings?.exceptions.length ? (
              <ul>
                {settings.exceptions.map((item) => (
                  <li key={item}>
                    <span>{item}</span>
                    <button
                      aria-label={"Retirer l’exception " + item}
                      onClick={() =>
                        run(() => change({ type: "remove", domain: item }))
                      }
                      disabled={controlsDisabled}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="quiet">Aucune exception enregistrée.</p>
            )}
          </section>
          <section className="catalog">
            <div className="catalog-heading">
              <h2 className="section-title">La liste ({catalog.length})</h2>
              <label className="sr-only" htmlFor="search">
                Chercher un domaine
              </label>
              <input
                id="search"
                placeholder="Chercher…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <p className="catalog-note">
              Liste embarquée. Les gestionnaires de tags et certains SDK peuvent
              aussi servir à des fonctions utiles : utilise les exceptions si un
              site ne fonctionne plus correctement.
            </p>
            <ul>
              {rules.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.domain}</strong>
                    <span>
                      {item.name} · {categories[item.category].short}
                    </span>
                  </div>
                  <a
                    href={item.source}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={"Documentation de " + item.name}
                  >
                    ↗
                  </a>
                </li>
              ))}
            </ul>
            {!rules.length && <p className="quiet">Aucun domaine trouvé.</p>}
          </section>
          <button
            className="reset-button"
            disabled={controlsDisabled}
            onClick={() => {
              if (
                confirm(
                  "Rétablir les réglages et retirer toutes les exceptions ?",
                )
              )
                run(() => change({ type: "reset" }));
            }}
          >
            Rétablir les réglages
          </button>
        </>
      ) : (
        <>
          <section className="site-line">
            <span className="site-dot" />
            <div>
              <span className="small-label">SUR CETTE PAGE</span>
              <strong>
                {snapshot?.host ||
                  (installed ? "Page non accessible" : "Aucun onglet connecté")}
              </strong>
            </div>
            <span
              className={"site-state " + (!paused && supported ? "active" : "")}
            >
              {!snapshot
                ? "—"
                : !supported
                  ? "Hors périmètre"
                  : paused
                    ? "En pause"
                    : "Filtré"}
            </span>
          </section>
          <section className="tally">
            <div className="count">
              <strong>{snapshot ? activity.total : "—"}</strong>
              <span>
                requête{activity.total === 1 ? "" : "s"}
                <br />
                bloquée{activity.total === 1 ? "" : "s"} relevée
                {activity.total === 1 ? "" : "s"}
              </span>
            </div>
            <div className="domain-count">
              <strong>{snapshot ? activity.domains : "—"}</strong>
              <span>domaine{activity.domains === 1 ? "" : "s"}</span>
            </div>
            <p>
              5 dernières minutes
              {activity.limited ? " · 500 derniers blocages" : ""}
            </p>
          </section>
          <div className="activity-heading">
            <h2>Ce qui est resté dehors</h2>
            <button
              aria-label="Actualiser le relevé"
              disabled={controlsDisabled || !supported}
              onClick={() => run(refresh)}
            >
              ↻
            </button>
          </div>
          <div className="filter-row" aria-label="Filtrer les blocages">
            {[
              ["all", "Tout"],
              ...Object.entries(categories).map(([key, value]) => [
                key,
                value.short,
              ]),
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                className={filter === key ? "selected" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {groups.length ? (
            <ul className="blocked-list">
              {groups.map((group) => (
                <li key={group.id}>
                  <span className={"category-dot " + group.category} />
                  <div>
                    <strong>{group.domain}</strong>
                    <span>
                      {group.name} · {clock(group.lastSeen)}
                    </span>
                  </div>
                  <b>×{group.count}</b>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <span aria-hidden="true">∅</span>
              <p>
                {filter === "all"
                  ? "Rien à afficher pour le moment."
                  : "Aucun blocage dans cette catégorie."}
              </p>
              <small>
                Un relevé vide ne garantit pas l’absence de tracking.
              </small>
            </div>
          )}
          {supported && (
            <button
              className="site-exception"
              disabled={controlsDisabled}
              onClick={() =>
                run(async () => {
                  if (snapshot.excepted) {
                    const inherited = settings.exceptions.filter(
                      (value) =>
                        snapshot.host === value ||
                        snapshot.host.endsWith("." + value),
                    );
                    for (const domain of inherited)
                      await change({ type: "remove", domain });
                  } else await change({ type: "allow", domain: snapshot.host });
                })
              }
            >
              {snapshot.excepted
                ? "Filtrer à nouveau ce site"
                : "Laisser passer ce site"}{" "}
              <span>↗</span>
            </button>
          )}
          {needsReload && supported && (
            <p className="reload-note">
              Les prochaines requêtes suivent le nouveau réglage.{" "}
              <button onClick={() => run(reloadTab)}>Recharger la page</button>
            </p>
          )}
          <footer>
            <button onClick={() => run(openOptions)}>Réglages & liste ↗</button>
            <button
              disabled={controlsDisabled || !supported || !activity.total}
              onClick={() =>
                run(async () => {
                  await send("clear");
                  await refresh();
                })
              }
            >
              Effacer le relevé
            </button>
          </footer>
        </>
      )}
      <p className="privacy-note">
        Pas de compte. Pas de serveur. Ça reste dans ton navigateur.
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
