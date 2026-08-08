#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src/Prototype.tsx"
source = path.read_text(encoding="utf-8")
old = '<KeyboardInput type="number" inputMode="decimal" min={0} max={100_000} step="any" placeholder="Montant réel" data-testid="spend-input"'
new = '<KeyboardInput inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder="Montant réel" data-testid="spend-input"'
if source.count(old) != 1:
    raise RuntimeError(f"spend input marker expected once, found {source.count(old)}")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
print("French decimal input restored while retaining numeric clamping.")
