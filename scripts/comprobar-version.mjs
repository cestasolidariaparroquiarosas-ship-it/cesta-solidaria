#!/usr/bin/env node
// Política de versiones (spec §7): cada PR sube la versión de package.json y
// añade su entrada en CHANGELOG.md. Esta comprobación corre en CI (CA-30 y CA-32):
//   1. La versión es SemVer válida.
//   2. CHANGELOG.md tiene una sección "## [X.Y.Z]" para esa versión.
//   3. Es mayor que la última etiqueta publicada y que la versión de la rama destino
//      (BASE_REF, p. ej. "main"), para que dos PR no publiquen la misma versión.
// Con --solo-changelog imprime las notas de la versión actual (para la GitHub Release).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const fallo = (mensaje) => {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
};

/** Cuerpo de la sección "## [v]" (sin el encabezado), o null si no existe. */
function notasDe(v) {
  const lineas = changelog.split("\n");
  const inicio = lineas.findIndex((l) => l.startsWith(`## [${v}]`));
  if (inicio === -1) return null;
  const fin = lineas.findIndex((l, i) => i > inicio && l.startsWith("## ["));
  return lineas
    .slice(inicio + 1, fin === -1 ? undefined : fin)
    .join("\n")
    .trim();
}

if (process.argv.includes("--solo-changelog")) {
  const notas = notasDe(version);
  if (!notas) fallo(`CHANGELOG.md no tiene sección para ${version}`);
  console.log(notas);
  process.exit(0);
}

const comparar = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

if (!SEMVER.test(version)) fallo(`La versión "${version}" no es SemVer (X.Y.Z)`);
if (!notasDe(version)) fallo(`CHANGELOG.md no tiene la sección "## [${version}]"`);

let etiquetas = [];
try {
  etiquetas = git("tag", "--list", "v*")
    .split("\n")
    .map((t) => t.trim().replace(/^v/, ""))
    .filter((t) => SEMVER.test(t));
} catch {
  // Sin historial de etiquetas (primer despliegue): nada que comparar.
}

if (etiquetas.includes(version)) fallo(`La versión ${version} ya está publicada: súbela`);
const ultima = etiquetas.sort(comparar).at(-1);
if (ultima && comparar(version, ultima) <= 0) {
  fallo(`La versión ${version} debe ser mayor que la última publicada (${ultima})`);
}

const base = process.env.BASE_REF;
if (base) {
  let versionBase = null;
  try {
    versionBase = JSON.parse(git("show", `origin/${base}:package.json`)).version;
  } catch {
    // La rama destino aún no tiene package.json (primer PR): nada que comparar.
  }
  if (versionBase && comparar(version, versionBase) <= 0) {
    fallo(`La versión ${version} debe ser mayor que la de ${base} (${versionBase}). Actualiza la rama y sube la versión.`);
  }
}

console.log(`✓ Versión ${version} lista para publicar${ultima ? ` (última publicada: ${ultima})` : ""}`);
