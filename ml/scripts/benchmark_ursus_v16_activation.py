"""Reproducible smoke-performance benchmark for approved Ursus models.

The script reads immutable artifacts and prints JSON to stdout. It does not
load evaluation splits, fit models, or write reports.
"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
from statistics import mean
import subprocess
import sys
from time import perf_counter

import numpy as np

from ml.model_registry import load_model


SMOKE_OBSERVATIONS = (
    "falha no sensor da esteira",
    "esteira escapou e parou a linha",
    "valvula de enchimento travada",
    "garrafas caindo no transporte",
    "motor desarmou durante a producao",
    "falha de comunicacao no equipamento",
    "mangueira de ar rompida",
    "latas enroscadas na entrada",
    "falha no corte do filme",
    "bomba desarmou durante a operacao",
)


class ProcessMemoryCounters(ctypes.Structure):
    _fields_ = [
        ("cb", wintypes.DWORD),
        ("PageFaultCount", wintypes.DWORD),
        ("PeakWorkingSetSize", ctypes.c_size_t),
        ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t),
        ("PeakPagefileUsage", ctypes.c_size_t),
    ]


def working_set_mb() -> float | None:
    if sys.platform != "win32":
        return None
    counters = ProcessMemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    success = ctypes.windll.psapi.GetProcessMemoryInfo(
        ctypes.windll.kernel32.GetCurrentProcess(),
        ctypes.byref(counters),
        counters.cb,
    )
    if not success:
        return None
    return counters.WorkingSetSize / (1024 * 1024)


def percentile_95(values: list[float]) -> float:
    return float(np.percentile(np.asarray(values, dtype=float), 95))


def benchmark(version: str, repetitions: int) -> dict[str, object]:
    memory_before = working_set_mb()
    full_started = perf_counter()
    loaded = load_model(version)
    full_load_seconds = perf_counter() - full_started
    memory_after = working_set_mb()

    vectorizer = loaded.package["vectorizer"]
    classifier = loaded.package["classifier"]

    # Warm-up is intentionally outside the measured samples.
    warm = vectorizer.transform([SMOKE_OBSERVATIONS[0]])
    classifier.decision_function(warm)

    latencies_ms: list[float] = []
    for _ in range(repetitions):
        for observation in SMOKE_OBSERVATIONS:
            started = perf_counter()
            features = vectorizer.transform([observation])
            scores = np.asarray(classifier.decision_function(features), dtype=float)
            if scores.shape != (1, len(classifier.classes_)) or not np.isfinite(scores).all():
                raise RuntimeError(f"Invalid {version} smoke output.")
            latencies_ms.append((perf_counter() - started) * 1000.0)

    return {
        "version": version,
        "artifact": str(loaded.spec.artifact_path),
        "artifact_size_mb": round(loaded.spec.artifact_path.stat().st_size / (1024 * 1024), 3),
        "integrity_and_load_seconds": round(full_load_seconds, 6),
        "joblib_load_seconds": round(loaded.load_seconds, 6),
        "working_set_before_mb": round(memory_before, 3) if memory_before is not None else None,
        "working_set_after_mb": round(memory_after, 3) if memory_after is not None else None,
        "working_set_delta_mb": (
            round(memory_after - memory_before, 3)
            if memory_before is not None and memory_after is not None
            else None
        ),
        "inference_samples": len(latencies_ms),
        "inference_avg_ms": round(mean(latencies_ms), 6),
        "inference_p95_ms": round(percentile_95(latencies_ms), 6),
        "top3_smoke_ok": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--child-version", choices=("v1.5", "v1.6"))
    parser.add_argument("--repetitions", type=int, default=3)
    args = parser.parse_args()

    if args.child_version:
        print(json.dumps(benchmark(args.child_version, args.repetitions)))
        return

    results: dict[str, object] = {}
    script = Path(__file__).resolve()
    root = script.parents[2]
    for version in ("v1.5", "v1.6"):
        completed = subprocess.run(
            [
                sys.executable,
                str(script),
                "--child-version",
                version,
                "--repetitions",
                str(args.repetitions),
            ],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
        results[version] = json.loads(completed.stdout)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
