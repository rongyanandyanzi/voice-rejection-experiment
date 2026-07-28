import json
import math

import numpy as np
import pandas as pd


DATA_PATH = "data_export_2026-07-25/survey_responses.csv"
PARTICIPANT_PATH = "data_export_2026-07-25/participants.csv"
OUT_PATH = "data_export_2026-07-25/survey_factorial_analysis.json"

SCALES = {
    "PR": [f"PR{i}" for i in range(1, 6)],
    "MR": [f"MR{i}" for i in range(1, 4)],
    "MA": [f"MA{i}" for i in range(1, 9)],
    "MC": [f"MC{i}" for i in range(1, 7)],
}


def cronbach_alpha(frame):
    x = frame.astype(float)
    k = x.shape[1]
    total_var = x.sum(axis=1).var(ddof=1)
    return k / (k - 1) * (1 - x.var(axis=0, ddof=1).sum() / total_var)


def hedges_g(high, low):
    high = np.asarray(high, dtype=float)
    low = np.asarray(low, dtype=float)
    n1, n0 = len(high), len(low)
    pooled = math.sqrt(
        ((n1 - 1) * high.var(ddof=1) + (n0 - 1) * low.var(ddof=1))
        / (n1 + n0 - 2)
    )
    d = (high.mean() - low.mean()) / pooled
    correction = 1 - 3 / (4 * (n1 + n0) - 9)
    return d * correction


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


def t_quantile_975(df):
    lo, hi = 0.0, 10.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if t_two_sided_p(mid, df) > 0.05:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def f_survival(f_value, df1, df2):
    x = df2 / (df2 + df1 * f_value)
    return regularized_beta(x, df2 / 2, df1 / 2)


def holm_adjust(p_values):
    order = np.argsort(p_values)
    adjusted = np.empty(len(p_values), dtype=float)
    running = 0.0
    m = len(p_values)
    for rank, idx in enumerate(order):
        value = min(1.0, (m - rank) * p_values[idx])
        running = max(running, value)
        adjusted[idx] = running
    return adjusted


def welch_contrast(frame, outcome, factor, high_label, low_label):
    high = frame.loc[frame[factor] == high_label, outcome].astype(float)
    low = frame.loc[frame[factor] == low_label, outcome].astype(float)
    diff = high.mean() - low.mean()
    se = math.sqrt(high.var(ddof=1) / len(high) + low.var(ddof=1) / len(low))
    df_num = (high.var(ddof=1) / len(high) + low.var(ddof=1) / len(low)) ** 2
    df_den = (
        (high.var(ddof=1) / len(high)) ** 2 / (len(high) - 1)
        + (low.var(ddof=1) / len(low)) ** 2 / (len(low) - 1)
    )
    df = df_num / df_den
    t_value = diff / se
    crit = t_quantile_975(df)
    return {
        "high_label": high_label,
        "low_label": low_label,
        "n_high": int(len(high)),
        "n_low": int(len(low)),
        "mean_high": float(high.mean()),
        "sd_high": float(high.std(ddof=1)),
        "mean_low": float(low.mean()),
        "sd_low": float(low.std(ddof=1)),
        "difference_high_minus_low": float(diff),
        "ci95_low": float(diff - crit * se),
        "ci95_high": float(diff + crit * se),
        "t": float(t_value),
        "df": float(df),
        "p_two_sided": float(t_two_sided_p(t_value, df)),
        "hedges_g": float(hedges_g(high, low)),
    }


raw = pd.read_csv(DATA_PATH, dtype=str)
participants = pd.read_csv(PARTICIPANT_PATH, dtype=str)
completion = participants[
    [
        "prolific_pid",
        "study_id",
        "session_id",
        "completion_status",
        "completed_post_interaction_survey",
        "completed_ai_check",
    ]
].copy()
raw = raw.merge(
    completion,
    on=["prolific_pid", "study_id", "session_id"],
    how="left",
    validate="one_to_one",
)
valid = raw[
    raw["prolific_pid"].notna()
    & (raw["prolific_pid"].str.strip().str.lower() != "missing")
    & (raw["survey_completion_status"] == "completed")
    & (raw["completion_status"] == "completed")
    & (raw["completed_post_interaction_survey"] == "true")
    & (raw["completed_ai_check"] == "true")
    & raw["assigned_condition"].isin(["HP_HC", "HP_LC", "LP_HC", "LP_LC"])
].copy()

all_items = [item for items in SCALES.values() for item in items]
valid[all_items] = valid[all_items].apply(pd.to_numeric, errors="coerce")
valid = valid.dropna(subset=all_items)
valid["politeness"] = valid["assigned_condition"].str.split("_").str[0]
valid["constructiveness"] = valid["assigned_condition"].str.split("_").str[1]

for scale, items in SCALES.items():
    valid[scale] = valid[items].mean(axis=1)

result = {
    "raw_rows": int(len(raw)),
    "valid_rows": int(len(valid)),
    "exclusion_rule": "Real non-missing Prolific PID; completed survey, post-survey AI check, and full experiment; valid 2x2 condition; no missing PR/MR/MA/MC items.",
    "condition_counts": valid["assigned_condition"].value_counts().sort_index().to_dict(),
    "reliability": {
        scale: float(cronbach_alpha(valid[items])) for scale, items in SCALES.items()
    },
    "condition_descriptives": {},
    "planned_contrasts": {},
    "factorial_models": {},
}

for scale in SCALES:
    stats = valid.groupby("assigned_condition")[scale].agg(["count", "mean", "std"])
    result["condition_descriptives"][scale] = {
        idx: {
            "n": int(row["count"]),
            "mean": float(row["mean"]),
            "sd": float(row["std"]),
        }
        for idx, row in stats.iterrows()
    }

contrast_specs = {
    "PR_HC_vs_LC": ("PR", "constructiveness", "HC", "LC"),
    "MR_LP_vs_HP": ("MR", "politeness", "LP", "HP"),
    "MA_HP_vs_LP": ("MA", "politeness", "HP", "LP"),
    "MC_HC_vs_LC": ("MC", "constructiveness", "HC", "LC"),
}

raw_ps = []
for name, spec in contrast_specs.items():
    contrast = welch_contrast(valid, *spec)
    result["planned_contrasts"][name] = contrast
    raw_ps.append(contrast["p_two_sided"])

holm = holm_adjust(raw_ps)
for name, adjusted in zip(contrast_specs, holm):
    result["planned_contrasts"][name]["p_holm_four_tests"] = float(adjusted)

for outcome in SCALES:
    p_code = np.where(valid["politeness"] == "HP", 1.0, -1.0)
    c_code = np.where(valid["constructiveness"] == "HC", 1.0, -1.0)
    x = np.column_stack([np.ones(len(valid)), p_code, c_code, p_code * c_code])
    y = valid[outcome].to_numpy(dtype=float)
    xtx_inv = np.linalg.inv(x.T @ x)
    beta = xtx_inv @ x.T @ y
    fitted = x @ beta
    residuals = y - fitted
    residual_ss = float(residuals @ residuals)
    total_ss = float(((y - y.mean()) ** 2).sum())
    df_resid = len(y) - x.shape[1]
    mse = residual_ss / df_resid
    labels = ["politeness", "constructiveness", "interaction"]
    terms = {}
    for column, label in zip(range(1, 4), labels):
        variance = mse * xtx_inv[column, column]
        t_value = beta[column] / math.sqrt(variance)
        f_value = t_value * t_value
        terms[label] = {
            "F": float(f_value),
            "df_num": 1.0,
            "df_den": float(df_resid),
            "p": float(f_survival(f_value, 1, df_resid)),
            "partial_eta_squared": float(f_value / (f_value + df_resid)),
            "coefficient_effect_coded": float(beta[column]),
        }
    result["factorial_models"][outcome] = {
        "r_squared": float(1 - residual_ss / total_ss),
        "terms": terms,
    }

with open(OUT_PATH, "w", encoding="utf-8") as handle:
    json.dump(result, handle, ensure_ascii=False, indent=2)

print(json.dumps(result, ensure_ascii=False, indent=2))
