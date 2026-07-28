# Constructiveness v2 Pilot Runbook

Do not deploy this branch to the current production service. The existing service and all v1 data remain unchanged until the pilot passes every gate.

## 1. Automated Checks

Run:

```bash
npm test
```

Start a local or isolated QA server with a temporary data directory and the required OpenAI environment variables. Then run:

```bash
QA_BASE_URL=http://localhost:8787 QA_CONCURRENCY=2 npm run qa:constructiveness
```

The batch covers 20 English and Chinese proposals across all four conditions. It generates a neutral follow up, first rejection, later rejection reply, and closing for each case.

QA reports are written under `data_export_constructiveness_v2_qa_*`. These directories are ignored by Git.

The runner checkpoints after every completed generation. If an external quota or connection problem interrupts a batch, resume the same report without repeating successful jobs:

```bash
QA_BASE_URL=http://localhost:8787 \
QA_RESUME_FILE=/absolute/path/to/constructiveness_qa.json \
QA_CONCURRENCY=2 \
npm run qa:constructiveness
```

For a deliberately smaller batch, use `QA_PROPOSAL_OFFSET`, `QA_PROPOSAL_LIMIT`, `QA_CONDITIONS`, or `QA_PHASES`. A final pass decision is valid only for the complete 20 proposal, four condition, four phase batch.

Do not open the pilot until:

* HC accepted component rate is at least 95 percent.
* LC failure or leakage rate is at most 5 percent.
* Average first rejection length differs by no more than 5 percent across conditions.
* HP and LP classification accuracy is at least 95 percent.
* No reply contains forbidden names or reveals the design.

## 2. Independent Render Service

Create a new Render service from `render-pilot.yaml`. Use a separate service name, public URL, persistent disk, and admin token.

Do not attach the pilot service to the current production disk. Do not reuse its data directory or public URL.

Set:

* `OPENAI_API_KEY`
* `OPENAI_MODEL`
* `OPENAI_EVALUATOR_MODEL`
* `OPENAI_REASONING_EFFORT`
* `OPENAI_TIMEOUT_MS`

Confirm `/api/health` works and download an empty or test only copy of:

* `participants.csv`
* `interactions.csv`
* `survey_responses.csv`
* `ai_requests.csv`

## 3. Four Prolific Cells

Create four separate Prolific studies with 20 approved places each. Use the same study materials and completion flow, changing only the condition query value.

```text
https://PILOT-SERVICE.onrender.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&condition=HP_HC
https://PILOT-SERVICE.onrender.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&condition=HP_LC
https://PILOT-SERVICE.onrender.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&condition=LP_HC
https://PILOT-SERVICE.onrender.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&condition=LP_LC
```

The separate study capacities provide the condition quotas. Verify the stored `assigned_condition` before releasing each cell.

## 4. Pilot Gate Analysis

Download the four CSV files into one local export directory. Run the local ignored analysis script:

```bash
python analyze_constructiveness_v2_pilot.py /path/to/pilot/export
```

The report is written to `pilot_exports/constructiveness_v2_pilot_gate.json`, which is ignored by Git.

The pilot passes only when all conditions are true:

* At least 20 valid completed participants per cell.
* MC is higher for HC than LC by at least 0.50 points.
* The MC contrast has Hedges' g of at least 0.60 and two sided p below .05.
* HC minus LC is positive within both HP and LP.
* MA is higher for HP than LP, with Hedges' g of at least 0.80 and p below .05.
* The absolute politeness cross effect on MC is below 0.30.
* The absolute constructiveness cross effect on MA is below 0.30.
* API failure rate is below 2 percent.
* The failure rate spread across conditions is at most 3 percentage points.

If any gate fails, do not replace production. Review actual manager messages, MC1 through MC6, MA1 through MA8, and `ai_requests.csv`, revise the manipulation, and run another independent pilot.

## 5. Version Isolation

Every new row records `constructiveness_v2` in `manipulation_version`.

Legacy rows without the field are treated as `constructiveness_v1`. Resumed legacy sessions retain v1. Never pool v1 and v2 in the confirmatory hypothesis test.
