// Source des données et du widget : la branche `main` du site, depuis la bascule v2 (origin/refonte est
// ancêtre de origin/main, 2026-10-21). Par défaut le worktree voisin `../website` ; `COACH_REFONTE` en désigne
// un autre (nom gardé pour les commandes existantes). La source doit être exactement sur origin/main (la
// référence locale, sans `git fetch`) : sur la branche `main`, ou détachée, notée alors `main`. Un `main` local en
// retard est refusé (le 2026-10-21, ../website était à 9c8cbc6, origin/main à 8d13b24). `COACH_ALLOW_BRANCH`
// lève le contrôle (essai seulement).
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_BRANCH = "main";
export const root = fileURLToPath(new URL("..", import.meta.url));
export const source = resolve(process.env.COACH_REFONTE ?? join(root, "..", "website"));

export function git(...args: string[]): string {
  return execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
}

function sourceBranch(): string {
  const name = git("rev-parse", "--abbrev-ref", "HEAD");
  const onOrigin = git("rev-parse", "HEAD") === git("rev-parse", `origin/${EXPECTED_BRANCH}`);
  if ((name === EXPECTED_BRANCH || name === "HEAD") && onOrigin) return EXPECTED_BRANCH;
  if (process.env.COACH_ALLOW_BRANCH) return name;
  throw new Error(`La source (« ${name} ») n'est pas exactement sur origin/${EXPECTED_BRANCH} : ${source}`);
}

export const branch = sourceBranch();
export const commit = git("rev-parse", "--short", "HEAD");
