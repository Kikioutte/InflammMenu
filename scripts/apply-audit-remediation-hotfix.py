#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

index_path = ROOT / "index.html"
index = index_path.read_text(encoding="utf-8")
index = index.replace("; upgrade-insecure-requests\" />", "\" />")
index_path.write_text(index, encoding="utf-8")

# Make the offline-safety contract executable in the static service-worker suite.
test_path = ROOT / "tests/service-worker.test.mjs"
tests = test_path.read_text(encoding="utf-8")
if "does not require HTTPS rewriting during local validation" not in tests:
    tests += '''\n\ntest("document CSP does not require HTTPS rewriting during local validation", async () => {\n  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");\n  assert.match(html, /Content-Security-Policy/);\n  assert.doesNotMatch(html, /upgrade-insecure-requests/);\n  assert.match(html, /object-src 'none'/);\n});\n'''
test_path.write_text(tests, encoding="utf-8")

print("Final CSP hotfix applied.")
