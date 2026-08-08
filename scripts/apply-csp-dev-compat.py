#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
index_path = root / "index.html"
index = index_path.read_text(encoding="utf-8")
index = index.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
index = index.replace("; upgrade-insecure-requests\" />", "\" />")
index_path.write_text(index, encoding="utf-8")

path = root / "tests/service-worker.test.mjs"
tests = path.read_text(encoding="utf-8")
if "allows the Vite development preamble" not in tests:
    tests += '''\n\ntest("document CSP allows the Vite development preamble without opening remote scripts", async () => {\n  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");\n  assert.match(html, /script-src 'self' 'unsafe-inline'/);\n  assert.doesNotMatch(html, /script-src[^;]*https?:/);\n});\n'''
path.write_text(tests, encoding="utf-8")
