import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd


CONDITIONS = ["HP_HC", "HP_LC", "LP_HC", "LP_LC"]
MA_ITEMS = [f"MA{i}" for i in range(1, 9)]
MC_ITEMS = [f"MC{i}" for i in range(1, 7)]


def beta_continued_fraction(a, b, x):
    max_iter, eps, fpmin = 200, 3e-14, 1e-300
    qab, qap, qam = a + b, a + 1, a - 1
    c = 1.0
    d = 1.0 - qab * x / qap
    d = fpmin if abs(d) < fpmin else d
    d = 1.0 / d
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = fpmin if abs(d) < fpmin else d
        c = 1.0 + aa / c
        c = fpmin if abs(c) < fpmin else c
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = fpmin if abs(d) < fpmin else d
        c = 1.0 + aa / c
        c = fpmin if abs(c) < fpmin else c
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def regularized_beta(x, a, b):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    log_bt = (
        math.lgamma(a + b)
        - math.lgamma(a)
        - math.lgamma(b)
        + a * math.log(x)
        + b * math.log(1 - x)
    )
    bt = math.exp(log_bt)
    if x < (a + 1) / (a + b + 2):
        return bt * beta_continued_fraction(a, b, x) / a
    return 1 - bt * beta_continued_fraction(b, a, 1 - x) / b


def t_two_sided_p(t_value, df):
    x = df / (df + t_value * t_value)
    return regularized_beta(x, df / 2, 0.5)


def hedges_g(high, low):
    high = np.asarray(high, dtype=float)
    low = np.asarray(low, dtype=float)
    n1, n0 = len(high), len(low)
    pooled = math.sqrt(
        ((n1 - 1) * high.var(ddof=1) + (n0 - 1) * low.var(ddof=1))
        / (n1 + n0 - 2)
    )
    if pooled == 0:
        return 0.0
    d = (high.mean() - low.mean()) / pooled
    correction = 1 - 3 / (4 * (n1 + n0) - 9)
    return float(d * correction)


def welch(high, low, high_label, low_label):
    high = np.asarray(high, dtype=float)
    low = np.asarray(low, dtype=float)
    high_var = high.var(ddof=1)
    low_var = low.var(ddof=1)
    se = math.sqrt(high_var / len(high) + low_var / len(low))
    diff = high.mean() - low.mean()
    if se == 0:
        t_value, df, p_value = 0.0, float(len(high) + len(low) - 2), 1.0
    else:
        t_value = diff / se
        df = (high_var / len(high) + low_var / len(low)) ** 2 / (
            (high_var / len(high)) ** 2 / (len(high) - 1)
            + (low_var / len(low)) ** 2 / (len(low) - 1)
        )
        p_value = t_two_sided_p(t_value, df)
    return {
        "high_label": high_label,
        "low_label": low_label,
        "n_high": int(len(high)),
        "n_low": int(len(low)),
        "mean_high": float(high.mean()),
        "mean_low": float(low.mean()),
        "difference_high_minus_low": float(diff),
        "hedges_g": hedges_g(high, low),
        "t": float(t_value),
        "df": float(df),
        "p_two_sided": float(p_value),
    }


def cronbach_alpha(frame):
    values = frame.astype(float)
    total_variance = values.sum(axis=1).var(ddof=1)
    if total_variance == 0:
        return 0.0
    k = values.shape[1]
    return float(k / (k - 1) * (1 - values.var(axis=0, ddof=1).sum() / total_variance))


def read_csv(path):
    if not path.exists():
        raise FileNotFoundError(path)
    return pd.read_csv(path, dtype=str)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", help="Directory containing the pilot CSV exports.")
    parser.add_argument("--output", default="pilot_exports/constructiveness_v2_pilot_gate.json")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    surveys = read_csv(data_dir / "survey_responses.csv")
    participants = read_csv(data_dir / "participants.csv")
    ai_requests = read_csv(data_dir / "ai_requests.csv")

    status_columns = [
        "prolific_pid",
        "study_id",
        "session_id",
        "completion_status",
        "completed_post_interaction_survey",
        "completed_ai_check",
    ]
    data = surveys.merge(
        participants[status_columns],
        on=["prolific_pid", "study_id", "session_id"],
        how="left",
        validate="one_to_one",
    )
    version = data.get("manipulation_version", pd.Series("", index=data.index)).fillna("")
    data = data[
        data["prolific_pid"].notna()
        & data["prolific_pid"].str.strip().str.lower().ne("missing")
        & data["survey_completion_status"].eq("completed")
        & data["completion_status"].eq("completed")
        & data["completed_post_interaction_survey"].eq("true")
        & data["completed_ai_check"].eq("true")
        & data["assigned_condition"].isin(CONDITIONS)
        & version.eq("constructiveness_v2")
    ].copy()

    items = MA_ITEMS + MC_ITEMS
    data[items] = data[items].apply(pd.to_numeric, errors="coerce")
    data = data.dropna(subset=items)
    data["MA"] = data[MA_ITEMS].mean(axis=1)
    data["MC"] = data[MC_ITEMS].mean(axis=1)
    data["politeness"] = data["assigned_condition"].str.split("_").str[0]
    data["constructiveness"] = data["assigned_condition"].str.split("_").str[1]

    mc_main = welch(
        data.loc[data["constructiveness"].eq("HC"), "MC"],
        data.loc[data["constructiveness"].eq("LC"), "MC"],
        "HC",
        "LC",
    )
    ma_main = welch(
        data.loc[data["politeness"].eq("HP"), "MA"],
        data.loc[data["politeness"].eq("LP"), "MA"],
        "HP",
        "LP",
    )
    cross_politeness_mc = welch(
        data.loc[data["politeness"].eq("HP"), "MC"],
        data.loc[data["politeness"].eq("LP"), "MC"],
        "HP",
        "LP",
    )
    cross_constructiveness_ma = welch(
        data.loc[data["constructiveness"].eq("HC"), "MA"],
        data.loc[data["constructiveness"].eq("LC"), "MA"],
        "HC",
        "LC",
    )

    within_politeness = {}
    for politeness in ["HP", "LP"]:
        subset = data[data["politeness"].eq(politeness)]
        within_politeness[politeness] = welch(
            subset.loc[subset["constructiveness"].eq("HC"), "MC"],
            subset.loc[subset["constructiveness"].eq("LC"), "MC"],
            f"{politeness}_HC",
            f"{politeness}_LC",
        )

    # The politeness contrast has to be the same size under both constructiveness levels. Total reply
    # length is matched, so a low-constructiveness reply has spare words that a high-constructiveness
    # reply spends on diagnosis; if those go into extra warmth or extra dismissal then the politeness
    # manipulation is stronger in the LC cells and any P x C interaction on an outcome is partly an
    # artefact of the manipulation rather than a finding.
    within_constructiveness = {}
    for constructiveness in ["HC", "LC"]:
        subset = data[data["constructiveness"].eq(constructiveness)]
        within_constructiveness[constructiveness] = welch(
            subset.loc[subset["politeness"].eq("HP"), "MA"],
            subset.loc[subset["politeness"].eq("LP"), "MA"],
            f"HP_{constructiveness}",
            f"LP_{constructiveness}",
        )
    politeness_contrast_gap = abs(
        within_constructiveness["HC"]["hedges_g"] - within_constructiveness["LC"]["hedges_g"]
    )

    ai_version = ai_requests.get(
        "manipulation_version",
        pd.Series("", index=ai_requests.index),
    ).fillna("")
    pilot_requests = ai_requests[
        ai_version.eq("constructiveness_v2")
        & ai_requests["assigned_condition"].isin(CONDITIONS)
    ].copy()
    pilot_requests["failed"] = ~pilot_requests["ok"].str.lower().eq("true")
    api_failure_rate = float(pilot_requests["failed"].mean()) if len(pilot_requests) else 1.0
    condition_failure_rates = {
        condition: float(
            pilot_requests.loc[
                pilot_requests["assigned_condition"].eq(condition), "failed"
            ].mean()
        )
        for condition in CONDITIONS
    }
    condition_failure_values = [
        value for value in condition_failure_rates.values() if not math.isnan(value)
    ]
    condition_failure_spread = (
        max(condition_failure_values) - min(condition_failure_values)
        if len(condition_failure_values) == 4
        else 1.0
    )

    counts = data["assigned_condition"].value_counts().reindex(CONDITIONS, fill_value=0)
    gates = {
        "at_least_20_valid_per_cell": bool((counts >= 20).all()),
        "mc_hc_gt_lc_by_0_50": mc_main["difference_high_minus_low"] >= 0.50,
        "mc_hedges_g_at_least_0_60": mc_main["hedges_g"] >= 0.60,
        "mc_p_below_0_05": mc_main["p_two_sided"] < 0.05,
        "mc_direction_positive_within_hp": within_politeness["HP"]["difference_high_minus_low"] > 0,
        "mc_direction_positive_within_lp": within_politeness["LP"]["difference_high_minus_low"] > 0,
        "ma_hp_gt_lp": ma_main["difference_high_minus_low"] > 0,
        "ma_hedges_g_at_least_0_80": ma_main["hedges_g"] >= 0.80,
        "ma_p_below_0_05": ma_main["p_two_sided"] < 0.05,
        "politeness_cross_effect_on_mc_below_0_30": abs(cross_politeness_mc["hedges_g"]) < 0.30,
        "constructiveness_cross_effect_on_ma_below_0_30": abs(cross_constructiveness_ma["hedges_g"]) < 0.30,
        "politeness_contrast_equal_across_constructiveness": politeness_contrast_gap < 0.40,
        "api_failure_rate_below_0_02": api_failure_rate < 0.02,
        "condition_failure_spread_at_most_0_03": condition_failure_spread <= 0.03,
    }
    result = {
        "manipulation_version": "constructiveness_v2",
        "valid_n": int(len(data)),
        "condition_counts": {key: int(value) for key, value in counts.items()},
        "reliability": {
            "MA": cronbach_alpha(data[MA_ITEMS]),
            "MC": cronbach_alpha(data[MC_ITEMS]),
        },
        "item_means": {
            item: {
                condition: float(
                    data.loc[data["assigned_condition"].eq(condition), item].mean()
                )
                for condition in CONDITIONS
            }
            for item in items
        },
        "mc_hc_vs_lc": mc_main,
        "mc_hc_vs_lc_within_politeness": within_politeness,
        "ma_hp_vs_lp": ma_main,
        "ma_hp_vs_lp_within_constructiveness": within_constructiveness,
        "politeness_contrast_gap_across_constructiveness": politeness_contrast_gap,
        "cross_effect_politeness_on_mc": cross_politeness_mc,
        "cross_effect_constructiveness_on_ma": cross_constructiveness_ma,
        "api": {
            "requests": int(len(pilot_requests)),
            "failure_rate": api_failure_rate,
            "failure_rate_by_condition": condition_failure_rates,
            "condition_failure_rate_spread": condition_failure_spread,
        },
        "gates": gates,
        "passed": bool(all(gates.values())),
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"Pilot gate report written to {output_path}")
    if not result["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
