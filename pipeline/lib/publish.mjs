// Veröffentlicht die Daten als Einzel-Commit ohne Historie auf den Branch "data".
// Die Website liest von dort; kein Vercel-Deploy pro Update, kein Repo-Wachstum.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function publishToBranch({ repoDir, files, branch = "data", message }) {
  const git = (args, opts = {}) =>
    execFileSync("git", args, { cwd: repoDir, encoding: "utf8", ...opts }).trim();
  const indexFile = path.join(repoDir, "var", "publish.index");
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  git(["read-tree", "--empty"], { env });
  for (const [dest, src] of Object.entries(files)) {
    const blob = git(["hash-object", "-w", src]);
    git(["update-index", "--add", "--cacheinfo", `100644,${blob},${dest}`], { env });
  }
  const tree = git(["write-tree"], { env });
  const commit = git(["commit-tree", tree, "-m", message], {
    env: {
      ...env,
      GIT_AUTHOR_NAME: "zeroradar-bot",
      GIT_AUTHOR_EMAIL: "noreply@zeroradar",
      GIT_COMMITTER_NAME: "zeroradar-bot",
      GIT_COMMITTER_EMAIL: "noreply@zeroradar",
    },
  });
  git(["push", "--force", "--quiet", "origin", `${commit}:refs/heads/${branch}`]);
  return commit;
}
