import json
import subprocess
from pathlib import Path

import pytest

from app.adapters.pricing import resolve_price

FIXTURES = Path(__file__).parent / "fixtures" / "pricing_matrix.json"
CASES = json.loads(FIXTURES.read_text(encoding="utf-8"))
FRONTEND_ROOT = Path(__file__).parents[2] / "frontend"


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_python_matches_fixture(case):
    price = resolve_price(case["product"], case["quantity"], case["role"], case["total_lots"])
    assert price == case["expected_price"]


def test_ts_mirror_matches_fixture():
    result = subprocess.run(
        ["node", "scripts/pricing-parity.mjs"],
        cwd=FRONTEND_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"TS mirror mismatch:\n{result.stdout}\n{result.stderr}"
