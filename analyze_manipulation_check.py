"""Readable manipulation-check report for an experiment_data.xlsx export.

The pilot gate in analyze_constructiveness_v2_pilot.py answers "may we launch": it reads the CSV
exports, filters to constructiveness_v2, and emits pass/fail JSON. This script answers "did the
manipulation land", works on the xlsx export, and runs against whichever manipulation version is
present so a v1 run can be compared with a v2 run.

MA1-MA8 is the politeness manipulation check, MC1-MC6 the constructiveness manipulation check.

Usage:
    python3 analyze_manipulation_check.py data_export_2026-07-25/experiment_data.xlsx
    python3 analyze_manipulation_check.py <export.xlsx> --version constructiveness_v2
"""
import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd

from analyze_constructiveness_v2_pilot import (
    CONDITIONS,
    MA_ITEMS,
    MC_ITEMS,
    cronbach_alpha,
    hedges_g,
    t_two_sided_p,
    welch,
)

ITEMS = MA_ITEMS + MC_ITEMS


def load_surveys(path, version, real_prolific_only=False):
    surveys = pd.read_excel(path, "survey_responses")
    if real_prolific_only:
        # Real Prolific PIDs are 24-char hex. Everything else is a test or placeholder session
        # (missing, test_zh_0714, render-lphc-en-..., [oid]).
        surveys = surveys[surveys["prolific_pid"].astype(str).str.fullmatch(r"[0-9a-fA-F]{24}")]
    if version:
        present = surveys.get("manipulation_version")
        if present is None:
            raise SystemExit(
                "This export has no manipulation_version column, so --version cannot be applied."
            )
        surveys = surveys[present.fillna("").eq(version)]
    surveys = surveys[surveys["assigned_condition"].isin(CONDITIONS)].copy()
    surveys[ITEMS] = surveys[ITEMS].apply(pd.to_numeric, errors="coerce")
    dropped = surveys[ITEMS].isna().any(axis=1).sum()
    surveys = surveys.dropna(subset=ITEMS)
    surveys["MA"] = surveys[MA_ITEMS].mean(axis=1)
    surveys["MC"] = surveys[MC_ITEMS].mean(axis=1)
    surveys["politeness"] = surveys["assigned_condition"].str.split("_").str[0]
    surveys["constructiveness"] = surveys["assigned_condition"].str.split("_").str[1]
    return surveys, int(dropped)


def anova_2x2(data, dv):
    """Type III sums of squares for a 2x2 via effect-coded least squares.

    Cell sizes are unequal, so each term's SS is the increase in residual SS when that column is
    dropped from the full model. That is the standard Type III test and does not assume balance.
    """
    y = data[dv].to_numpy(dtype=float)
    p = np.where(data["politeness"].eq("HP"), 1.0, -1.0)
    c = np.where(data["constructiveness"].eq("HC"), 1.0, -1.0)
    columns = {"politeness": p, "constructiveness": c, "interaction": p * c}
    full = np.column_stack([np.ones(len(y)), *columns.values()])

    def residual_ss(design):
        beta, *_ = np.linalg.lstsq(design, y, rcond=None)
        return float(((y - design @ beta) ** 2).sum())

    ss_residual = residual_ss(full)
    df_within = len(y) - full.shape[1]
    if df_within <= 0 or ss_residual <= 0:
        raise SystemExit(f"Not enough residual variance to test {dv}.")
    ms_within = ss_residual / df_within

    rows = {"df_within": df_within}
    for name in columns:
        reduced = np.column_stack(
            [np.ones(len(y))] + [vector for key, vector in columns.items() if key != name]
        )
        ss_term = residual_ss(reduced) - ss_residual
        f_value = max(0.0, ss_term) / ms_within
        # For F(1, df) the upper tail equals the two-sided t tail at sqrt(F).
        rows[name] = {
            "F": float(f_value),
            "p": float(t_two_sided_p(math.sqrt(f_value), df_within)),
            "partial_eta_sq": float(ss_term / (ss_term + ss_residual)),
        }
    return rows


def fmt_p(value):
    return "<.0001" if value < 0.0001 else f"{value:.4f}"


def verdict(ok):
    return "PASS" if ok else "FAIL"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("export", help="Path to an experiment_data.xlsx export.")
    parser.add_argument(
        "--version",
        default="",
        help="Filter to one manipulation_version (e.g. constructiveness_v2). Default: no filter.",
    )
    parser.add_argument(
        "--real-prolific-only",
        action="store_true",
        help="Keep only 24-char hex Prolific IDs, dropping test and placeholder sessions.",
    )
    args = parser.parse_args()

    path = Path(args.export)
    if not path.exists():
        raise SystemExit(f"Export not found: {path}")
    data, dropped = load_surveys(path, args.version, args.real_prolific_only)
    if data.empty:
        raise SystemExit("No survey rows matched the requested version and conditions.")

    counts = data["assigned_condition"].value_counts().reindex(CONDITIONS, fill_value=0)
    print(f"Export: {path}")
    print(f"Manipulation version filter: {args.version or '(none)'}")
    print(f"Valid n = {len(data)}  (dropped {dropped} rows with incomplete MA/MC items)")
    print("Cell sizes: " + "  ".join(f"{c}={int(counts[c])}" for c in CONDITIONS))
    print(f"Reliability: MA alpha = {cronbach_alpha(data[MA_ITEMS]):.3f}   "
          f"MC alpha = {cronbach_alpha(data[MC_ITEMS]):.3f}")

    print("\n=== CELL MEANS ===")
    print(f"{'condition':<12}{'n':>4}{'MA (politeness)':>18}{'MC (constructiveness)':>24}")
    for condition in CONDITIONS:
        cell = data[data["assigned_condition"].eq(condition)]
        print(f"{condition:<12}{len(cell):>4}"
              f"{cell['MA'].mean():>12.3f} (SD {cell['MA'].std(ddof=1):.2f})"
              f"{cell['MC'].mean():>16.3f} (SD {cell['MC'].std(ddof=1):.2f})")

    print("\n=== MANIPULATION CHECKS (2x2 ANOVA) ===")
    for dv, factor, label in [("MA", "politeness", "Politeness -> MA"),
                              ("MC", "constructiveness", "Constructiveness -> MC")]:
        table = anova_2x2(data, dv)
        row = table[factor]
        high, low = ("HP", "LP") if dv == "MA" else ("HC", "LC")
        column = "politeness" if dv == "MA" else "constructiveness"
        contrast = welch(data.loc[data[column].eq(high), dv],
                         data.loc[data[column].eq(low), dv], high, low)
        print(f"{label}: F(1,{table['df_within']}) = {row['F']:.2f}, p = {fmt_p(row['p'])}, "
              f"partial eta sq = {row['partial_eta_sq']:.3f}, "
              f"{high}-{low} = {contrast['difference_high_minus_low']:+.3f}, "
              f"g = {contrast['hedges_g']:+.3f}  [{verdict(row['p'] < 0.05 and contrast['hedges_g'] > 0)}]")

    print("\n=== DISCRIMINANT VALIDITY (each factor should move only its own check) ===")
    cross_p_mc = welch(data.loc[data["politeness"].eq("HP"), "MC"],
                       data.loc[data["politeness"].eq("LP"), "MC"], "HP", "LP")
    cross_c_ma = welch(data.loc[data["constructiveness"].eq("HC"), "MA"],
                       data.loc[data["constructiveness"].eq("LC"), "MA"], "HC", "LC")
    own_c = welch(data.loc[data["constructiveness"].eq("HC"), "MC"],
                  data.loc[data["constructiveness"].eq("LC"), "MC"], "HC", "LC")
    print(f"Politeness on MC (should be ~0):        g = {cross_p_mc['hedges_g']:+.3f}  "
          f"[{verdict(abs(cross_p_mc['hedges_g']) < 0.30)}]")
    print(f"Constructiveness on MA (should be ~0):  g = {cross_c_ma['hedges_g']:+.3f}  "
          f"[{verdict(abs(cross_c_ma['hedges_g']) < 0.30)}]")
    print(f"r(MA, MC) = {data['MA'].corr(data['MC']):+.3f}")
    if abs(cross_p_mc["hedges_g"]) > abs(own_c["hedges_g"]):
        print("  WARNING: politeness moves MC more than constructiveness does. The constructiveness "
              "check is not measuring the constructiveness manipulation.")

    print("\n=== SIMPLE EFFECTS: constructiveness on MC, within each politeness level ===")
    for politeness in ["HP", "LP"]:
        subset = data[data["politeness"].eq(politeness)]
        row = welch(subset.loc[subset["constructiveness"].eq("HC"), "MC"],
                    subset.loc[subset["constructiveness"].eq("LC"), "MC"],
                    f"{politeness}_HC", f"{politeness}_LC")
        print(f"  {politeness}: HC = {row['mean_high']:.3f}, LC = {row['mean_low']:.3f}, "
              f"diff = {row['difference_high_minus_low']:+.3f}, g = {row['hedges_g']:+.3f}, "
              f"p = {fmt_p(row['p_two_sided'])}  [{verdict(row['difference_high_minus_low'] > 0)}]")

    print("\n=== ORTHOGONALITY: is the politeness contrast the same size in HC and LC? ===")
    gaps = {}
    for constructiveness in ["HC", "LC"]:
        subset = data[data["constructiveness"].eq(constructiveness)]
        row = welch(subset.loc[subset["politeness"].eq("HP"), "MA"],
                    subset.loc[subset["politeness"].eq("LP"), "MA"],
                    f"HP_{constructiveness}", f"LP_{constructiveness}")
        gaps[constructiveness] = row["hedges_g"]
        print(f"  {constructiveness}: HP - LP on MA = {row['difference_high_minus_low']:+.3f}, "
              f"g = {row['hedges_g']:+.3f}")
    gap = abs(gaps["HC"] - gaps["LC"])
    print(f"  |g(HC) - g(LC)| = {gap:.3f}  [{verdict(gap < 0.40)}]")
    if gap >= 0.40:
        print("  WARNING: the politeness manipulation is stronger at one constructiveness level. A "
              "P x C interaction on any outcome would be partly an artefact of that imbalance.")

    print("\n=== CEILING CHECK: is 'high' actually high in absolute terms? ===")
    for condition, dv, name in [("HP_HC", "MC", "constructiveness"), ("LP_HC", "MC", "constructiveness"),
                                ("HP_HC", "MA", "politeness"), ("HP_LC", "MA", "politeness")]:
        values = data.loc[data["assigned_condition"].eq(condition), dv].astype(float)
        if len(values) < 2:
            continue
        se = values.std(ddof=1) / math.sqrt(len(values))
        t_value = (values.mean() - 3.0) / se if se > 0 else 0.0
        print(f"  {condition} {dv} ({name}) = {values.mean():.3f} vs scale midpoint 3: "
              f"t = {t_value:+.2f}, p = {fmt_p(t_two_sided_p(t_value, len(values) - 1))}")

    print("\n=== POWER: n per cell needed for 80% power on a two-group contrast ===")
    for effect in [0.2, 0.35, 0.5, 0.8]:
        # Normal approximation: n per group = 2 * (z_alpha/2 + z_beta)^2 / d^2, z sum = 2.8016.
        per_group = math.ceil(2 * (2.8016 ** 2) / (effect ** 2))
        print(f"  g = {effect:.2f}  ->  {per_group} per group  "
              f"({per_group // 2} per cell in a 2x2 main-effect test)")
    print("  An interaction of the same size as a main effect needs roughly 4x these numbers.")


if __name__ == "__main__":
    main()
