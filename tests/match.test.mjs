import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, inRange, matchPackages, normName } from "../lib/match.mjs";
import { parseFeed } from "../pipeline/lib/feed.mjs";
import { PARSERS, requirements } from "../skill/zeroradar/scripts/lockfiles.mjs";

test("compareVersions", () => {
  assert.equal(compareVersions("1.2.10", "1.2.9"), 1);
  assert.equal(compareVersions("v2.0", "2.0.0"), 0);
  assert.equal(compareVersions("1.0.0-rc1", "1.0.0"), -1);
  assert.equal(compareVersions("abc", "1.0"), null);
});

test("inRange mit GHSA-Ranges", () => {
  assert.equal(inRange("16.2.9", ">= 16.0.0, <= 16.4.0"), true);
  assert.equal(inRange("16.4.1", ">= 16.0.0, <= 16.4.0"), false);
  assert.equal(inRange("1.2.3", "< 1.2.3"), false);
  assert.equal(inRange("1.2.3", "= 1.2.3"), true);
  assert.equal(inRange("1.2.3", null), "maybe");
  assert.equal(inRange("weird", "< 2.0"), "maybe");
});

test("matchPackages: Ökosystem-Aliasse und PyPI-Normalisierung", () => {
  const adv = [
    { id: "A", products: [{ ecosystem: "pip", name: "Foo_Bar", vulnerable: "< 2.0", fixed: "2.0" }] },
    { id: "B", products: [{ ecosystem: "npm", name: "evil-pkg", vulnerable: ">= 0", fixed: null }] },
  ];
  const hits = matchPackages(
    [
      { ecosystem: "PyPI", name: "foo-bar", version: "1.9" },
      { ecosystem: "npm", name: "evil-pkg", version: "1.0.0" },
      { ecosystem: "pip", name: "foo.bar", version: "2.1" },
    ],
    adv,
  );
  assert.deepEqual(hits.map((h) => h.advisory.id), ["A", "B"]);
  assert.equal(normName("pip", "Foo__Bar"), "foo-bar");
});

test("parseFeed: RSS und Atom", () => {
  const rss = `<rss><channel><item><title>PHP 8.5.12 &amp; security</title><link>https://x/1</link><pubDate>Tue, 21 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Fixes CVE-2026-109618</p>]]></description></item></channel></rss>`;
  const [r] = parseFeed(rss);
  assert.equal(r.title, "PHP 8.5.12 & security");
  assert.equal(r.url, "https://x/1");
  assert.match(r.text, /CVE-2026-109618/);
  const atom = `<feed><entry><title>GitLab patch</title><link rel="alternate" href="https://y/2"/><updated>2026-10-21T10:00:00Z</updated><summary>RCE</summary></entry></feed>`;
  const [a] = parseFeed(atom);
  assert.equal(a.url, "https://y/2");
  assert.equal(a.published, "2026-10-21T10:00:00.000Z");
});

test("Lockfile-Parser", () => {
  const lock = JSON.stringify({ packages: { "": { name: "app" }, "node_modules/next": { version: "16.2.9" }, "node_modules/a/node_modules/b": { version: "1.0.0" } } });
  assert.deepEqual(PARSERS["package-lock.json"](lock).map((p) => `${p.name}@${p.version}`), ["next@16.2.9", "b@1.0.0"]);
  assert.deepEqual(requirements("Django==5.1.2\nrequests[socks]==2.32.0 ; python_version>'3'\n# x\nflask>=3"), [
    { ecosystem: "pip", name: "Django", version: "5.1.2" },
    { ecosystem: "pip", name: "requests", version: "2.32.0" },
  ]);
  const gosum = "golang.org/x/net v0.30.0 h1:abc=\ngolang.org/x/net v0.30.0/go.mod h1:def=\n";
  assert.deepEqual(PARSERS["go.sum"](gosum), [{ ecosystem: "go", name: "golang.org/x/net", version: "0.30.0" }]);
});
