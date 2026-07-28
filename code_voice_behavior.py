"""Code voice frequency and voice quality in the second (neutral) manager conversation.

Unit of analysis is one participant's whole contribution to that conversation, which matches how
the VF and VQ survey items are worded. Greetings and procedural turns ("hello", "proceed", "no")
are stripped first so they cannot inflate either code.

voice_frequency  Count of distinct, non-redundant suggestions. Restating or elaborating an idea
                 already offered does not add to the count, so a long repetitive turn does not
                 outscore a short varied one.

voice_quality    Mean of four 1-5 sub-scores taken directly from the VQ items in this study:
                   vq1_evidence      backed by records, visitor comments, location information
                   vq2_concerns      addresses demand, feasibility, and operational concerns
                   vq3_clarification clears up doubts the manager raised
                   vq4_actionable    offers a clear, actionable solution
                 Left missing when voice_frequency is 0. Quality is conditional on having voiced;
                 scoring a non-voicer as 0 would make the two columns correlate by construction.

Coding is done by an LLM at temperature 0 against a fixed rubric. Per-participant reasoning is
written to a side file so every code can be audited, and a human should double-code a subset to
establish reliability before these numbers go into a paper.

Usage:
    export OPENAI_API_KEY=...
    python3 code_voice_behavior.py <experiment_data.xlsx> --reorganized <reorganized.xlsx>
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

STAGE = "neutral_manager_followup"
PARTICIPANT_SPEAKERS = {"you", "alex"}
REAL_PID = r"[0-9a-fA-F]{24}"
# Turns that carry no proposal content: greetings, acknowledgements, and the literal control words
# the interface asks participants to type.
PROCEDURAL = re.compile(
    r"^\s*(hi|hello|hey|ok|okay|proceed|continue|next|yes|no|nope|yep|yeah|thanks|thank you|"
    r"bye|goodbye|done|sure|nothing|none|n/?a|keep talking|what are your thoughts)[\s.!,?]*$",
    re.IGNORECASE,
)

RUBRIC = """You are coding workplace voice behaviour for an organisational psychology study.

A participant playing an Operations Team Member spoke with a park manager about how to improve
attendance on off-season weekdays. You receive that participant's own turns, in order, with the
manager's turns for context. Code only what the participant said.

voice_frequency: how many DISTINCT suggestions the participant made.
- A suggestion is a proposed change, action, or course of action for the park.
- Count distinct ideas, not messages. Restating, elaborating, defending, or giving detail about an
  idea already counted does not add to the count.
- Two ideas are distinct when acting on one would not accomplish the other. "Student discounts"
  and "more photo spots" are distinct. "Attract students" followed by "offer student discounts"
  is one idea stated at two levels of detail.
- Answering a manager's clarification question about an existing idea is not a new suggestion.
- Describing the background information they were given is not a suggestion.
- If the participant made no suggestion at all, return 0.

Then rate the quality of their voice on four dimensions, each 1 to 5, where 1 is not at all and 5
is to a great extent. Rate only the participant's own contribution.
- vq1_evidence: backs the suggestion with the entrance records, visitor comments, attendance
  figures, or location information available to them, rather than asserting it unsupported.
- vq2_concerns: engages the manager's practical concerns about visitor demand, feasibility, cost,
  or park operations.
- vq3_clarification: resolves doubts or questions the manager raised, rather than repeating or
  ignoring them.
- vq4_actionable: gives a concrete, implementable course of action rather than a general wish.

If voice_frequency is 0, set all four sub-scores to 0; they will be treated as missing.

Also return `suggestions`: a short label for each distinct suggestion you counted, in order.
Return `note`: one sentence justifying the frequency count.
Return only JSON matching the schema."""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "voice_frequency": {"type": "integer"},
        "suggestions": {"type": "array", "items": {"type": "string"}},
        "vq1_evidence": {"type": "integer"},
        "vq2_concerns": {"type": "integer"},
        "vq3_clarification": {"type": "integer"},
        "vq4_actionable": {"type": "integer"},
        "note": {"type": "string"},
    },
    "required": [
        "voice_frequency", "suggestions", "vq1_evidence", "vq2_concerns",
        "vq3_clarification", "vq4_actionable", "note",
    ],
}
SUBSCORES = ["vq1_evidence", "vq2_concerns", "vq3_clarification", "vq4_actionable"]


def build_transcripts(interactions):
    """One transcript per participant: their turns, with manager turns for context."""
    df = interactions[interactions.prolific_pid.astype(str).str.fullmatch(REAL_PID)].copy()
    df = df[df.stage.eq(STAGE)]
    df["order"] = pd.to_numeric(df.response_order, errors="coerce")
    df = df.sort_values(["prolific_pid", "order"])

    out = {}
    for pid, group in df.groupby("prolific_pid"):
        lines, own = [], []
        for _, row in group.iterrows():
            speaker = str(row.speaker).lower()
            text = str(row.message).strip()
            if not text or text.lower() == "nan":
                continue
            if speaker == "manager":
                lines.append(f"Manager: {text}")
            elif speaker in PARTICIPANT_SPEAKERS:
                lines.append(f"Participant: {text}")
                if not PROCEDURAL.match(text):
                    own.append(text)
        if lines:
            out[pid] = {"transcript": "\n".join(lines), "substantive_turns": len(own)}
    return out


def call_openai(model, transcript, api_key, retries=4):
    body = {
        "model": model,
        "input": [
            {"role": "system", "content": RUBRIC},
            {"role": "user", "content": f"Conversation:\n{transcript}"},
        ],
        "text": {"format": {"type": "json_schema", "name": "voice_coding",
                            "strict": True, "schema": SCHEMA}},
        "max_output_tokens": 2000,
    }
    # Reasoning-capable models reject temperature; everything else gets temperature 0 so the
    # coding is reproducible.
    if re.match(r"^(gpt-5|o[13])", model):
        body["reasoning"] = {"effort": "low"}
    else:
        body["temperature"] = 0

    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = json.loads(response.read())
            for item in payload.get("output", []):
                for part in item.get("content", []):
                    text = part.get("text")
                    if text:
                        return json.loads(text)
            last = "no text in response"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
            last = str(error)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"OpenAI coding failed: {last}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("export", help="experiment_data.xlsx containing the interactions sheet.")
    parser.add_argument("--reorganized", help="Workbook whose first sheet receives the columns.")
    parser.add_argument("--output", default="", help="Where to write the coded workbook.")
    parser.add_argument("--model", default=os.environ.get("OPENAI_EVALUATOR_MODEL")
                        or os.environ.get("OPENAI_MODEL") or "gpt-5.5")
    parser.add_argument("--limit", type=int, default=0, help="Code only the first N participants.")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is not set.")

    interactions = pd.read_excel(args.export, "interactions")
    transcripts = build_transcripts(interactions)
    pids = sorted(transcripts)
    if args.limit:
        pids = pids[: args.limit]
    print(f"Coding {len(pids)} participants with {args.model}.", flush=True)

    rows, audit = [], []
    for index, pid in enumerate(pids, 1):
        entry = transcripts[pid]
        result = call_openai(args.model, entry["transcript"], api_key)
        frequency = max(0, int(result["voice_frequency"]))
        if frequency == 0:
            quality = None
        else:
            quality = sum(int(result[k]) for k in SUBSCORES) / len(SUBSCORES)
        rows.append({"prolific_pid": pid, "voice_frequency": frequency, "voice_quality": quality})
        audit.append({"prolific_pid": pid, "substantive_turns": entry["substantive_turns"],
                      "voice_frequency": frequency, "voice_quality": quality,
                      **{k: result[k] for k in SUBSCORES},
                      "suggestions": " | ".join(result["suggestions"]),
                      "note": result["note"], "transcript": entry["transcript"]})
        print(f"  [{index}/{len(pids)}] {pid[:8]} freq={frequency} "
              f"quality={'NA' if quality is None else f'{quality:.2f}'}", flush=True)

    coded = pd.DataFrame(rows)
    audit_frame = pd.DataFrame(audit)

    out_path = Path(args.output) if args.output else None
    if args.reorganized:
        book = pd.ExcelFile(args.reorganized)
        sheets = {name: book.parse(name) for name in book.sheet_names}
        first = book.sheet_names[0]
        merged = sheets[first].merge(coded, on="prolific_pid", how="left")
        sheets[first] = merged
        sheets["Voice coding audit"] = audit_frame
        out_path = out_path or Path(args.reorganized).with_name(
            Path(args.reorganized).stem + "_voice_coded.xlsx")
        with pd.ExcelWriter(out_path) as writer:
            for name, frame in sheets.items():
                frame.to_excel(writer, sheet_name=name[:31], index=False)
        coded_rows = merged.voice_frequency.notna().sum()
        print(f"\n{coded_rows}/{len(merged)} rows in '{first}' received codes.")
    else:
        out_path = out_path or Path("voice_coding.xlsx")
        with pd.ExcelWriter(out_path) as writer:
            coded.to_excel(writer, sheet_name="Voice coding", index=False)
            audit_frame.to_excel(writer, sheet_name="Voice coding audit", index=False)

    print(f"Written to {out_path}")
    voiced = coded[coded.voice_frequency > 0]
    print(f"\nvoice_frequency: mean {coded.voice_frequency.mean():.2f}, "
          f"median {coded.voice_frequency.median():.0f}, "
          f"range {coded.voice_frequency.min()}-{coded.voice_frequency.max()}, "
          f"{(coded.voice_frequency == 0).sum()} participants voiced nothing")
    print(f"voice_quality:   mean {voiced.voice_quality.mean():.2f}, "
          f"median {voiced.voice_quality.median():.2f}, "
          f"n={len(voiced)} (missing where frequency is 0)")


if __name__ == "__main__":
    main()
