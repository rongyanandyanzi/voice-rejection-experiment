import json

import numpy as np
import pandas as pd


SURVEY_PATH = "data_export_2026-07-25/survey_responses.csv"
PARTICIPANT_PATH = "data_export_2026-07-25/participants.csv"
OUT_PATH = "data_export_2026-07-25/dual_mediation_path_analysis.json"
BOOTSTRAPS = 10000
SEED = 20260725

SCALES = {
    "PR": [f"PR{i}" for i in range(1, 6)],
    "MR": [f"MR{i}" for i in range(1, 4)],
    "VQ": [f"VQ{i}" for i in range(1, 5)],
    "VF": [f"VF{i}" for i in range(1, 7)],
}


def cronbach_alpha(frame):
    x = frame.astype(float)
    k = x.shape[1]
    return float(
        k / (k - 1)
        * (1 - x.var(axis=0, ddof=1).sum() / x.sum(axis=1).var(ddof=1))
    )


def ols(y, x):
    design = np.column_stack([np.ones(len(y)), x])
    beta = np.linalg.lstsq(design, y, rcond=None)[0]
    fitted = design @ beta
    residual = y - fitted
    sse = residual @ residual
    sst = ((y - y.mean()) ** 2).sum()
    return beta, float(1 - sse / sst)


def standardize(values):
    return (values - values.mean(axis=0)) / values.std(axis=0, ddof=1)


def percentile_summary(draws):
    draws = np.asarray(draws, dtype=float)
    low, high = np.percentile(draws, [2.5, 97.5])
    p_sign = 2 * min(np.mean(draws <= 0), np.mean(draws >= 0))
    return {
        "estimate": float(np.mean(draws)),
        "bootstrap_se": float(draws.std(ddof=1)),
        "ci95_low": float(low),
        "ci95_high": float(high),
        "bootstrap_p_two_sided": float(min(1.0, p_sign)),
        "significant_ci_excludes_zero": bool(low > 0 or high < 0),
    }


survey = pd.read_csv(SURVEY_PATH, dtype=str)
participants = pd.read_csv(PARTICIPANT_PATH, dtype=str)
status = participants[
    [
        "prolific_pid",
        "study_id",
        "session_id",
        "completion_status",
        "completed_post_interaction_survey",
        "completed_ai_check",
    ]
]
data = survey.merge(
    status,
    on=["prolific_pid", "study_id", "session_id"],
    how="left",
    validate="one_to_one",
)
data = data[
    data["prolific_pid"].notna()
    & data["prolific_pid"].str.strip().str.lower().ne("missing")
    & data["survey_completion_status"].eq("completed")
    & data["completion_status"].eq("completed")
    & data["completed_post_interaction_survey"].eq("true")
    & data["completed_ai_check"].eq("true")
    & data["assigned_condition"].isin(["HP_HC", "HP_LC", "LP_HC", "LP_LC"])
].copy()

items = [item for scale_items in SCALES.values() for item in scale_items]
data[items] = data[items].apply(pd.to_numeric, errors="coerce")
data = data.dropna(subset=items)
for scale, scale_items in SCALES.items():
    data[scale] = data[scale_items].mean(axis=1)

# Centered effect coding. Each coefficient is the average factorial main effect
# across the other manipulated factor while the interaction remains controlled.
data["HC"] = np.where(data["assigned_condition"].str.endswith("_HC"), 0.5, -0.5)
data["LP"] = np.where(data["assigned_condition"].str.startswith("LP_"), 0.5, -0.5)
data["HCxLP"] = data["HC"] * data["LP"]

predictors = ["HC", "LP", "HCxLP"]
mediators = ["PR", "MR"]
outcomes = ["VQ", "VF"]

x_treatment = data[predictors].to_numpy(float)
m_values = data[mediators].to_numpy(float)

path_models = {}
mediator_betas = {}
for mediator in mediators:
    beta, r2 = ols(data[mediator].to_numpy(float), x_treatment)
    mediator_betas[mediator] = beta
    path_models[f"{mediator}_on_treatments"] = {
        "coefficients_unstandardized": dict(
            zip(["intercept"] + predictors, map(float, beta))
        ),
        "r_squared": r2,
    }

outcome_betas = {}
for outcome in outcomes:
    full_x = np.column_stack([x_treatment, m_values])
    beta, r2 = ols(data[outcome].to_numpy(float), full_x)
    outcome_betas[outcome] = beta
    total_beta, total_r2 = ols(data[outcome].to_numpy(float), x_treatment)
    path_models[f"{outcome}_on_treatments_and_mediators"] = {
        "coefficients_unstandardized": dict(
            zip(["intercept"] + predictors + mediators, map(float, beta))
        ),
        "r_squared": r2,
        "total_effect_model_coefficients": dict(
            zip(["intercept"] + predictors, map(float, total_beta))
        ),
        "total_effect_model_r_squared": total_r2,
    }

# Standardized coefficients for comparability. Binary treatments are standardized
# only for reporting standardized path coefficients, not for indirect effect inference.
z_frame = data[predictors + mediators + outcomes].astype(float).copy()
z_frame.loc[:, :] = standardize(z_frame.to_numpy(float))
standardized_paths = {}
z_treatment = z_frame[predictors].to_numpy(float)
z_mediators = z_frame[mediators].to_numpy(float)
for mediator in mediators:
    beta, _ = ols(z_frame[mediator].to_numpy(float), z_treatment)
    standardized_paths[f"{mediator}_on_treatments"] = dict(
        zip(predictors, map(float, beta[1:]))
    )
for outcome in outcomes:
    beta, _ = ols(
        z_frame[outcome].to_numpy(float),
        np.column_stack([z_treatment, z_mediators]),
    )
    standardized_paths[f"{outcome}_on_treatments_and_mediators"] = dict(
        zip(predictors + mediators, map(float, beta[1:]))
    )

# Nonparametric case-resampling bootstrap for all specific indirect effects.
rng = np.random.default_rng(SEED)
n = len(data)
draws = {
    f"{treatment}_to_{outcome}_via_{mediator}": []
    for treatment in ["HC", "LP"]
    for outcome in outcomes
    for mediator in mediators
}
path_draws = {
    **{
        f"{treatment}_to_{mediator}": []
        for treatment in ["HC", "LP"]
        for mediator in mediators
    },
    **{
        f"{mediator}_to_{outcome}": []
        for mediator in mediators
        for outcome in outcomes
    },
}
total_indirect_draws = {
    f"{treatment}_to_{outcome}_total_indirect": []
    for treatment in ["HC", "LP"]
    for outcome in outcomes
}

for _ in range(BOOTSTRAPS):
    idx = rng.integers(0, n, n)
    sample = data.iloc[idx]
    tx = sample[predictors].to_numpy(float)
    ms = sample[mediators].to_numpy(float)
    a = {}
    for mediator in mediators:
        beta, _ = ols(sample[mediator].to_numpy(float), tx)
        a[mediator] = dict(zip(predictors, beta[1:]))
        for treatment in ["HC", "LP"]:
            path_draws[f"{treatment}_to_{mediator}"].append(
                a[mediator][treatment]
            )
    b = {}
    for outcome in outcomes:
        beta, _ = ols(
            sample[outcome].to_numpy(float),
            np.column_stack([tx, ms]),
        )
        b[outcome] = dict(zip(mediators, beta[4:]))
        for mediator in mediators:
            path_draws[f"{mediator}_to_{outcome}"].append(
                b[outcome][mediator]
            )
    for treatment in ["HC", "LP"]:
        for outcome in outcomes:
            total = 0.0
            for mediator in mediators:
                indirect = a[mediator][treatment] * b[outcome][mediator]
                draws[f"{treatment}_to_{outcome}_via_{mediator}"].append(indirect)
                total += indirect
            total_indirect_draws[
                f"{treatment}_to_{outcome}_total_indirect"
            ].append(total)

indirect_effects = {
    key: percentile_summary(values) for key, values in draws.items()
}
path_inference = {
    key: percentile_summary(values) for key, values in path_draws.items()
}
total_indirect_effects = {
    key: percentile_summary(values) for key, values in total_indirect_draws.items()
}

# Replace bootstrap means with the exact point estimate from the original sample.
for treatment in ["HC", "LP"]:
    treatment_idx = predictors.index(treatment) + 1
    for outcome in outcomes:
        outcome_beta = outcome_betas[outcome]
        exact_total = 0.0
        for mediator in mediators:
            mediator_idx = mediators.index(mediator)
            exact = (
                mediator_betas[mediator][treatment_idx]
                * outcome_beta[1 + len(predictors) + mediator_idx]
            )
            key = f"{treatment}_to_{outcome}_via_{mediator}"
            indirect_effects[key]["estimate"] = float(exact)
            path_inference[f"{treatment}_to_{mediator}"]["estimate"] = float(
                mediator_betas[mediator][treatment_idx]
            )
            exact_total += exact
        total_key = f"{treatment}_to_{outcome}_total_indirect"
        total_indirect_effects[total_key]["estimate"] = float(exact_total)

for outcome in outcomes:
    for mediator_idx, mediator in enumerate(mediators):
        path_inference[f"{mediator}_to_{outcome}"]["estimate"] = float(
            outcome_betas[outcome][1 + len(predictors) + mediator_idx]
        )

result = {
    "valid_n": int(n),
    "condition_counts": data["assigned_condition"].value_counts().sort_index().to_dict(),
    "coding": {
        "HC": "+0.5=HC, -0.5=LC",
        "LP": "+0.5=LP, -0.5=HP",
        "interaction": "HC × LP; centered effect coding",
    },
    "scale_reliability_alpha": {
        scale: cronbach_alpha(data[scale_items])
        for scale, scale_items in SCALES.items()
    },
    "scale_descriptives": {
        scale: {
            "mean": float(data[scale].mean()),
            "sd": float(data[scale].std(ddof=1)),
        }
        for scale in SCALES
    },
    "scale_correlations": data[list(SCALES)].corr().round(6).to_dict(),
    "path_models": path_models,
    "standardized_paths": standardized_paths,
    "path_bootstrap_inference": path_inference,
    "specific_indirect_effects": indirect_effects,
    "total_indirect_effects": total_indirect_effects,
    "bootstrap": {"draws": BOOTSTRAPS, "seed": SEED, "method": "case-resampling percentile"},
}

with open(OUT_PATH, "w", encoding="utf-8") as handle:
    json.dump(result, handle, ensure_ascii=False, indent=2)

print(json.dumps(result, ensure_ascii=False, indent=2))
