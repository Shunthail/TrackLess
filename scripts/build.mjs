import { build } from "esbuild";
import * as sass from "sass";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { icon } from "./icons.mjs";

const html = (title) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="icon" href="icons/32.png"><link rel="stylesheet" href="app.css"><script src="app.js" type="module"></script></head><body><div id="root"></div></body></html>`;
await rm("dist", { recursive: true, force: true });
const css = sass.compile("src/ui/app.scss", { style: "compressed" }).css;
for (const target of ["chrome", "firefox"]) {
  const directory = `dist/${target}`;
  await mkdir(`${directory}/icons`, { recursive: true });
  await build({
    entryPoints: ["src/background/index.js"],
    outfile: `${directory}/background.js`,
    bundle: true,
    format: "iife",
    target: "es2022",
    define: { __BROWSER__: JSON.stringify(target) },
    legalComments: "eof",
  });
  await build({
    entryPoints: ["src/ui/index.jsx"],
    outfile: `${directory}/app.js`,
    bundle: true,
    format: "esm",
    target: "es2022",
    plugins: [
      {
        name: "shared-react",
        setup(builder) {
          builder.onResolve({ filter: /^(react|react-dom\/client)$/ }, () => ({
            path: "./vendor.js",
            external: true,
          }));
        },
      },
    ],
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    legalComments: "eof",
  });
  await build({
    entryPoints: ["src/ui/vendor.js"],
    outfile: `${directory}/vendor.js`,
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    legalComments: "eof",
  });
  const notices = await Promise.all(
    ["react", "react-dom"].map(
      async (name) =>
        `${name}\n${await readFile(`node_modules/${name}/LICENSE`, "utf8")}`,
    ),
  );
  await writeFile(`${directory}/THIRD_PARTY_NOTICES.txt`, notices.join("\n\n"));
  await writeFile(`${directory}/app.css`, css);
  await writeFile(`${directory}/popup.html`, html("TrackLess"));
  await writeFile(`${directory}/options.html`, html("TrackLess — Réglages"));
  await writeFile(
    `${directory}/manifest.json`,
    await readFile(`extension/manifest.${target}.json`),
  );
  for (const size of [16, 32, 48, 128])
    await writeFile(`${directory}/icons/${size}.png`, icon(size));
}
console.log("Extensions construites dans dist/chrome et dist/firefox.");
