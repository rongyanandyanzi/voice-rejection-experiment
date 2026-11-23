#!/usr/bin/env python3
"""Build the Qualtrics import file (QSF) for The Coding Shift: the one-session voice rejection study.

Usage:
    python3 qualtrics/coding_shift/build_coding_shift_qsf.py
        [--service-url https://aetheria-gardens-messages.onrender.com]
        [--completion-url https://app.prolific.com/submissions/complete?cc=CODE]
        [--out qualtrics/coding_shift/the_coding_shift_v7.qsf]

Import in Qualtrics: Projects > Create a new project > Survey > Import a QSF file. Everything is
inside: blocks, questions, question JavaScript, embedded data, randomiser, branches and the
end-of-survey redirect. The flow is documented in coding_shift_flow.md next to this script.

Version 7 (2026-11-16, user decisions of 10-16 November; full materials in
coding_shift_v7_materials_2026-11-16.md). The participant is hired for one short shift as a Feedback
Coder while the coding scheme is under review. Batch 1 (eight comments, four of which raise two
problems), a requested note to the coding supervisor, batch 2 while the note is reviewed, the
supervisor's messages with the reply in the assigned cell, then batch 3 (eight comments: three raise
two problems, three fit no category). After the reply nothing is requested: the coder can send a
remark at the midpoint of batch 3 (after comment 4) and, at the end, finish, send a quick remark, or
prepare a proposal in a workspace that shows the coder's own coding. Voice frequency is
the number of occasions used; voice quality improvement effort is the coded content plus the logged
work. The supervisor rates each coder at the end of the shift; the rule never mentions notes.
Versions up to 6 are built from the git history of this file (last v6 commit 12ea8b5).
"""
import argparse
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from build_qsf import Survey, paragraphs, bullets, strip_html, force_validation  # noqa: E402

SERVICE_PLACEHOLDER = "https://YOUR-SERVICE.onrender.com"


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as handle:
        return handle.read()


def js(name, service_url):
    return read(name).replace(SERVICE_PLACEHOLDER, service_url)


def esc(text):
    return html.escape(text, quote=False)


# ---------------------------------------------------------------------------------------------
# Content. The same comments, rule, rationale and admin tasks as the design document and prototype.
# ---------------------------------------------------------------------------------------------
CATEGORIES = [
    ("TECH", "Technical problem", "Something in the study did not work: a page, a clip, a button, the timing, or how it displayed."),
    ("WORDING", "Unclear instruction or question", "An instruction, question or answer option was confusing or hard to interpret."),
    ("LENGTH", "Length or pace", "How long the study took, including taking longer than the time advertised, or how slow or drawn-out it felt."),
    ("PAYMENT", "Payment or bonus", "The fee, the bonus, or when it is paid."),
    ("CONTENT", "Unsuitable question", "A question or topic that was too personal, inappropriate, one-sided, or did not apply to the person."),
]
CATEGORY_OPTIONS = [f"<b>{code}</b> &middot; {name}" for code, name, _ in CATEGORIES]

RULE_HTML = (
    "<div style=\"border:1px solid #d9dee5;border-radius:8px;padding:10px 14px;margin:10px 0 14px;background:#f6f8fa;font-size:14px;\">"
    "<b>How to label this comment</b>"
    "<p style=\"margin:6px 0 0\">Choose one category for each comment.</p>"
    "<p style=\"margin:4px 0 0\">There is no &ldquo;other&rdquo; option. Every comment gets one of the five categories.</p>"
    "</div>"
)

RATIONALE_HTML = paragraphs(
    "<b>One category per comment.</b> The project reports how many comments fall into each category and how often two coders agree. Both are built on one label per comment. With two labels, coders agree less often and the percentages add up to more than 100.",
    "<b>Choosing the main thing.</b> Coders will sometimes judge the main point differently. That is expected; the agreement check catches large disagreements.",
    "<b>No &ldquo;other&rdquo; option.</b> A leftover category tends to fill up with anything awkward, and the counts for the five real categories shrink. Every comment is placed in the closest category instead.",
    "<b>Changing a rule.</b> Every comment already coded would have to be coded again, so rules change only when there is clear evidence the change is worth it.",
)

# Both practice comments raise one problem, and the practice never mentions what to do with two
# (user decision 2026-10-10).
PRACTICE = [
    ("The audio clip on page 2 wouldn't play, so I had to guess what it said.",
     "<b>TECH.</b> The comment reports that part of the study did not work."),
    ("Question 7 was really confusing, I wasn't sure if it meant my current job or my last one.",
     "<b>WORDING.</b> The comment says a question was hard to interpret."),
]

# Ordinary end-of-study comments. Comments 3, 5, 6 and 8 raise two problems in two non-overlapping
# categories (definitions tightened and reactions removed on 2026-10-20, user decision).
BATCH1 = [
    "Couldn't get past page 4 for ages, the next button didn't do anything.",
    "Not sure what \"moderately often\" was supposed to mean.",
    "Video on page 3 kept buffering so I couldn't hear it properly. Also took way longer than the 10 mins it said.",
    "A couple of the questions assumed I have children, which I don't.",
    "It took far longer than it said it would, and I'm still not sure when I'll get paid.",
    "Some questions were a bit vague so I wasn't sure what to put, and the second half felt endless.",
    "Will the bonus be paid separately?",
    "Found the questions about my health a bit intrusive tbh, and the page froze when I hit submit.",
]
# Batch 2 is coded while the supervisor reviews batch 1 (added 2026-10-09; cut to five comments on
# 2026-10-10, user decision). Comments 2, 4 and 5 raise two problems, like batch 1, so the
# one-category tension stays live up to the reply; 1 and 3 raise one clear problem.
BATCH2 = [
    "The sound on the second video didn't work at all.",
    "The instructions for the sorting task were hard to follow, and the bonus is lower than the listing said.",
    "The questions about drinking assumed everyone drinks, which doesn't apply to me.",
    "The pictures took ages to load, and the whole thing took twice as long as advertised.",
    "I didn't agree with how the article described young people, and some of the answer options didn't make sense.",
]
# Batch 3 (the former batch 2). Since 2026-11-16 (user decision) comments 2, 6 and 8 raise two
# problems and comments 3, 5 and 7 (questions to the researchers) fit no category, so the rejected
# issue and a new issue are equally visible. At the midpoint, after comment 4, the coder has seen one
# of each. Comment 5 was "The questions about my family were quite personal, and the bonus still
# hasn't shown up." until then. (7 was praise until 2026-10-21; 18 of 19 coded it CONTENT once
# CONTENT was named "Question content", so CONTENT became "Unsuitable question" and 7 a request.)
BATCH3 = [
    "The page kept freezing whenever I tried to go back.",
    "I couldn't tell whether \"often\" meant every day or every week, and it dragged on much longer than it needed to.",
    "Could you tell me when the results will be published?",
    "It was a bit longer than I'd have liked.",
    "Which university is running this research?",
    "The video wouldn't play at all, and one of the questions had two \"agree\" options so I didn't know which to pick.",
    "Is there a follow-up study I can sign up for?",
    "Some of the questions felt a bit judgemental about how I spend my money, and it was far longer than the ten minutes promised.",
]

# The workspace was built on 2026-11-16 with two more sections: a project archive (thirty comments
# "from earlier shifts" with two coders' labels, written by us) and a page on how results are
# reported. The user removed both on 2026-11-17: the page asked too much, and the archive held
# comments the participant never coded. The workspace now shows the coder's own 21 comments only.
# Both sections are in the git history at 35d488b.

# The supervisor rates each coder at the end of the shift (2026-11-16). The line is repeated on the
# batch 3 pages and on the two choice pages; it never mentions notes.
RATING_REMINDER = "The supervisor rates each coder at the end of the shift."

# Admin tasks, not shown since 2026-10-19 and not built into version 7; kept here for the record.
LINK_CHECK = [
    ("Morning routines and sleep", "Some of the questions about bedtime were hard to answer honestly."),
    ("Choosing a mobile phone plan", "The video explaining the recipe steps wouldn't play."),
    ("Commuting and travel choices", "The questions about my train journey got a bit repetitive."),
    ("Shopping for groceries online", "I wasn't sure what counted as a weekly shop."),
    ("Reading habits", "The questions about my pension were confusing."),
]

# Note 1 is required since 2026-10-12 (user decision, after a pilot in which only 4 of 20 wrote an
# optional note): the supervisor asks every coder for comments on batch 1, so everyone gets a reply.
# Note 2 stays optional and is the voice measure.
# Both prompts reworded on 2026-10-28 (user decision). In pilot 8 only 9 of 21 notes were about the
# coding rules: 7 said "all fine" and 5 reported the studies' faults, which the old clause "any
# problems you ran into while coding the comments" invited. Note 1 now frames the note as input to a
# rule review and asks what the coder would change and why; the two-problem issue is still not
# named. Note 2 is deliberately softer (no question, no request for a proposal, no "nothing to add"
# line) because silence after the rejection is what it measures.
NOTE_PROMPT_1 = ("The coding supervisor is reviewing the coding rules and would like each coder's view after batch 1. "
                 "Is there anything in the five categories or in the one-category rule that should change? "
                 "Please say what you would change and why. "
                 "<span style='color:#e74c3c;'><b>Please comment on the coding rules themselves rather than on the studies the comments describe.</b></span>"
                 " The supervisor will read what you write.")
NOTE_PROMPT_2 = ("The coding supervisor is collecting coders' comments again after batch 3. "
                 "If there is anything about the coding rules or categories you would like to raise, you can write it here. "
                 "Please comment on the coding rules themselves rather than on the studies the comments describe. "
                 "The supervisor will read what you write.")

# ---------------------------------------------------------------------------------------------
# Page styling (2026-10-10, user request: one professional look on every page, key facts
# highlighted). Inline styles only, so they work in both survey engines.
# ---------------------------------------------------------------------------------------------
INK = "#1f2933"
MUTED = "#5f6b7a"
BLUE = "#2f5d8a"


def eyebrow(text):
    return f"<p style=\"font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:{BLUE};margin:0 0 4px;\">{text}</p>"


def title(text):
    return f"<p style=\"font-size:21px;font-weight:600;line-height:1.35;color:{INK};margin:0 0 12px;\">{text}</p>"


def para(text, last=False):
    return f"<p style=\"margin:0 0 {0 if last else 12}px;line-height:1.6;\">{text}</p>"


def small(text):
    return f"<p style=\"font-size:13px;line-height:1.5;color:{MUTED};margin:0;\">{text}</p>"


BOX_TONES = {
    "info": ("#2f5d8a", "#f3f6fa"),   # neutral facts
    "key": ("#c98a12", "#fff8e8"),    # something to keep in mind
    "good": ("#2f7a4a", "#eef7f0"),   # reassurance: payment, answers
}


def box(html, tone="info", heading=None):
    border, background = BOX_TONES[tone]
    head = f"<p style=\"margin:0 0 6px;font-weight:600;color:{border};\">{heading}</p>" if heading else ""
    return (f"<div style=\"border-left:4px solid {border};background:{background};border-radius:6px;"
            f"padding:12px 16px;margin:0 0 14px;line-height:1.6;\">{head}{html}</div>")


def items(*entries):
    return "<ul style=\"margin:0;padding-left:20px;\">" + "".join(
        f"<li style=\"margin:0 0 4px;\">{entry}</li>" for entry in entries) + "</ul>"


def page(*parts):
    return f"<div style=\"max-width:680px;font-size:16px;color:{INK};\">" + "".join(parts) + "</div>"


def section(text):
    return f"<p style=\"font-size:16px;font-weight:600;color:{INK};margin:18px 0 6px;padding-top:12px;border-top:1px solid #e3e7ec;\">{text}</p>"


def scale_intro(heading, instruction, stem=None, label="Questionnaire"):
    parts = [eyebrow(label), title(heading), para(instruction, last=stem is None)]
    if stem:
        parts.append(f"<p style=\"margin:0;font-style:italic;color:{MUTED};\">{stem}</p>")
    return page(*parts)


CARD_STYLE = "border:1px solid #d9dee5;border-radius:10px;overflow:hidden;background:#fff;margin:0 0 14px;max-width:640px;"
CARD_HEAD = "background:#f4f6f9;padding:10px 14px;border-bottom:1px solid #e3e7ec;font-size:12px;letter-spacing:.04em;color:#556270;text-transform:uppercase;"
CARD_BODY = "padding:14px;font-size:15px;line-height:1.5;color:#1f2933;"


def card(head, body_html):
    return f"<div style=\"{CARD_STYLE}\"><div style=\"{CARD_HEAD}\">{head}</div><div style=\"{CARD_BODY}\">{body_html}</div></div>"


# Each batch has its own colour, shown as a solid badge at the top of every page of the batch and as
# the tint and border of the comment card, so coders can tell batch 1, 2 and 3 apart at a glance
# (user request 2026-11-23). The comment is the largest text on the page: at 17px it was smaller
# than the answer options (same request).
BATCH_THEME = {
    1: ("#2f5d8a", "#eef3f9"),   # blue
    2: ("#1f7a6b", "#e9f6f2"),   # green
    3: ("#7a4a9e", "#f5eefa"),   # purple
    0: ("#5f6b7a", "#f3f5f7"),   # practice: grey
}
PILL = "display:inline-block;color:#fff;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 12px;border-radius:999px;"
PILL_REST = "font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#556270;margin-left:10px;"


def batch_badge(batch, rest="", label=None):
    colour = BATCH_THEME[batch][0]
    tail = f"<span style=\"{PILL_REST}\">{rest}</span>" if rest else ""
    return f"<p style=\"margin:0 0 10px;\"><span style=\"{PILL}background:{colour};\">{label or f'Batch {batch}'}</span>{tail}</p>"


def comment_card(batch, text):
    colour, tint = BATCH_THEME[batch]
    return (f"<p style=\"font-size:22px;line-height:1.45;font-weight:500;color:{INK};background:{tint};border-left:6px solid {colour};"
            f"border-radius:8px;padding:16px 18px;margin:0 0 14px;\">{esc(text)}</p>")


COMMENT_PROMPT = f"<p style=\"font-size:16px;color:{MUTED};margin:0;\">Which category does this comment belong to?</p>"


def comment_page(number, total, batch, text, reminder=None):
    return (
        batch_badge(batch, f"Comment {number} of {total}")
        # No rule box (removed 2026-10-08, user decision): the coder sees the comment and the five
        # categories only. The form allows one category and offers no "other".
        + comment_card(batch, text)
        + COMMENT_PROMPT
        + (f"<p style=\"font-size:13px;color:{MUTED};margin:10px 0 0;\">{reminder}</p>" if reminder else "")
    )


def tools_html(review_items_html):
    return (
        "<div style=\"margin:0 0 12px;\">"
        "<button type=\"button\" id=\"cs-tool-review\" style=\"margin:0 8px 8px 0;padding:6px 12px;font:inherit;font-size:13px;border:1px solid #bcc6cf;border-radius:4px;background:#fff;color:#2f5d8a;cursor:pointer;\">Review this batch</button>"
        # The "Why the rules are this way" tool was removed on 2026-10-08 (user decision). The
        # why_opens carriers and the tools script stay as they are; why_opens is always 0.
        f"<div id=\"cs-panel-review\" style=\"display:none;border:1px solid #d9dee5;border-radius:8px;padding:10px 14px;margin:4px 0 10px;background:#f6f8fa;font-size:14px;\"><ol style=\"margin:0;padding-left:20px;\">{review_items_html}</ol></div>"
        "</div>"
    )


def build(args):
    s = Survey("The Coding Shift v7", args.service_url, args.completion_url, args.completion_url)
    s.survey_title = "Comment coding"

    def payload_of(qid):
        return next(question["Payload"] for question in s.questions if question["PrimaryAttribute"] == qid)

    def show_if(qid, expression):
        """Display logic: the question is shown only when the expression is true. A page whose only
        question is hidden is skipped. (In-page display logic was tried first, 2026-11-16: the new
        survey-taking experience moved the question to a following page anyway and took the page
        timer with it, so the remark boxes now sit on their own page by design.)"""
        payload_of(qid)["DisplayLogic"] = {"0": {"0": dict(expression), "Type": "If"}, "Type": "BooleanExpression", "inPage": False}

    def choice(tag, text, options, force=True, js_code=None, randomize=False):
        qid = s.single_choice(tag, text, options, force=force, js=js_code)
        if randomize:
            for question in s.questions:
                if question["PrimaryAttribute"] == qid:
                    question["Payload"]["Randomization"] = {"Advanced": None, "TotalRandSubset": "", "Type": "All"}
        return qid

    # 1. Consent -----------------------------------------------------------------------------
    consent_text = s.text("consent_text", page(
        eyebrow("Paid coding work"),
        title("One short shift as a Feedback Coder"),
        para("You are being hired for one short shift as a Feedback Coder on our comment-coding project. You will sort short comments that people left at the end of earlier online studies into categories."),
        box(items(
            "<b>Three short batches</b> of comments, about <b>15 minutes</b> in total.",
            "The <b>coding supervisor</b> checks your work, decides on the coding rules, and issues each batch.",
            # No amount is named anywhere in the survey (user decision 2026-11-16).
            "At the end of the shift the supervisor gives each coder a <b>rating from 1 to 5</b>. The rating sets your <b>bonus</b>.",
        ), "info", "How the shift works"),
        box(items(
            "The supervisor may reply to anything you send. Replies can be <b>brief or critical</b>, as workplace feedback sometimes is.",
        ), "key", "Please note"),
        small("Your answers are stored anonymously under your Prolific ID. You can stop at any time by closing the page."),
    ), js=js("js_consent.js", s.service_url), description="Consent text")
    consent = choice("consent", "Are you willing to take part in this shift?", ["Yes, I agree, start the shift", "No, I do not want to take part"])
    s.block("Consent", [consent_text, consent], block_type="Default")

    # 2. Training ---------------------------------------------------------------------------
    category_rows = "".join(
        f"<div style=\"display:flex;gap:12px;align-items:baseline;padding:8px 0;border-bottom:1px solid #eef1f4;\">"
        f"<span style=\"flex:0 0 84px;font-size:12px;font-weight:600;letter-spacing:.04em;color:{BLUE};\">{code}</span>"
        f"<span><b>{name}.</b> {definition}</span></div>"
        for code, name, definition in CATEGORIES)
    rules_page = s.text("training_rules", page(
        eyebrow("Training"),
        title("Your job and the coding rules"),
        para("Each comment goes into one of five categories."),
        f"<div style=\"margin:0 0 16px;\">{category_rows}</div>",
        box("<b>Choose one category for each comment.</b>", "key"),
        small("Codebook v3.1 &middot; rules set by the coding supervisor"),
    ),
                        description="Training: rules")
    # Review framing and rating rule (2026-11-16, user decisions). The review is the setting, not
    # the coder's job: only the first note is requested. The rating rule does not mention notes
    # and uses no word for what a good note looks like, so it cannot tell the vague cells what the
    # constructive reply is meant to teach. Since 2026-11-17 (user request: "this is important")
    # the two paragraphs have a page of their own, after the rules page and before the practice,
    # instead of sitting under the category list. The wording is unchanged. The question is created
    # at the end of build() and inserted here, so every earlier QID stays as in the live survey.
    TRAINING_NOTICE_HTML = page(
        eyebrow("Training"),
        title("About this week and your rating"),
        box("The coding scheme is new and is under review this week. The coding supervisor decides whether any rule changes. After batch 1 the supervisor asks every coder for a first note. Later in the shift you can send a note if you wish.", "info", "About this week"),
        box("At the end of the shift the supervisor gives each coder a rating from 1 to 5. The rating reflects the supervisor&rsquo;s overall impression of working with you. It sets your bonus.", "key", "Your rating"),
        para("Two practice comments come first.", last=True),
    )
    # The "Why the rules are this way" training page was removed on 2026-10-07 (user decision); the
    # rationale is still available as a tool on the note 2 pages.
    # The practice items carry the rule box and an answer page that explains the rule (user
    # decision 2026-10-08: the rule is taught in the practice, and nowhere else before the reply).
    practice_page = lambda number, text: (
        batch_badge(0, f"{number} of 2", label="Practice")
        + RULE_HTML
        + comment_card(0, text) + COMMENT_PROMPT
    )
    practice1 = choice("practice_1", practice_page(1, PRACTICE[0][0]), CATEGORY_OPTIONS)
    practice1_fb = s.text("practice_1_feedback", page(
        eyebrow("Practice 1 of 2"), title("Answer"),
        f"<p style=\"font-size:16px;line-height:1.5;border-left:3px solid #bcc6cf;padding-left:12px;color:{MUTED};margin:0 0 12px;\">{esc(PRACTICE[0][0])}</p>",
        box(PRACTICE[0][1], "good"),
    ), description="Practice 1 feedback")
    practice2 = choice("practice_2", practice_page(2, PRACTICE[1][0]), CATEGORY_OPTIONS)
    practice2_fb = s.text("practice_2_feedback", page(
        eyebrow("Practice 2 of 2"), title("Answer"),
        f"<p style=\"font-size:16px;line-height:1.5;border-left:3px solid #bcc6cf;padding-left:12px;color:{MUTED};margin:0 0 12px;\">{esc(PRACTICE[1][0])}</p>",
        box(PRACTICE[1][1], "good"),
        box("<b>Batch 1 starts on the next page.</b> Your labels there count.", "key"),
    ), description="Practice 2 feedback")
    t_train = s.timing("t_training")
    s.block("Training", [rules_page, t_train, "PB", practice1, "PB", practice1_fb, practice2, "PB", practice2_fb])

    # 3. Batch 1 ----------------------------------------------------------------------------
    b1_elements = []
    b1_qids = []
    for index, text in enumerate(BATCH1, 1):
        # The last comment's page records when batch 1 was submitted, which anchors T.
        anchor_js = js("js_batch1_anchor.js", s.service_url) if index == len(BATCH1) else None
        qid = choice(f"b1_{index}", comment_page(index, len(BATCH1), 1, text), CATEGORY_OPTIONS, js_code=anchor_js)
        b1_qids.append(qid)
        b1_elements += [qid, s.timing(f"t_b1_{index}")]
        if index < len(BATCH1):
            b1_elements.append("PB")
    # Batch 1 opens with its own page (added 2026-10-11, user request: make each batch clear).
    b1_intro = s.text("batch1_intro", page(
        batch_badge(1, "of 3"),
        title("Batch 1: eight comments"),
        box("Practice is complete. Batch 1 has <b>eight comments</b>. Choose one category for each. <b>Your labels in this batch count.</b>", "info"),
        small("After batch 1 the coding supervisor will ask for your comments on the batch."),
    ), description="Batch 1 intro")
    s.block("Batch 1", [b1_intro, "PB"] + b1_elements)

    # 4. Note 1 -----------------------------------------------------------------------------
    # One page, shown to everyone after batch 1 (the separate attach/finish choice page was dropped
    # on 2026-10-08): an empty box means no note.
    note1 = s.essay("note1", page(
        batch_badge(1, "complete"),
        title("The coding supervisor asks for your comments"),
        box(NOTE_PROMPT_1, "info"),
        small("Your answer goes to the coding supervisor with batch 1."),
    ),
                    force=True, js=js("js_note_essay.js", s.service_url), height=180)
    # "What happens next" page straight after note 1 (added 2026-10-11, user request). With a note
    # it says the note is with the supervisor and being reviewed; without one, that batch 1 is being
    # checked. js_interim.js picks the version and starts the reply here, so the extra page does not
    # delay it.
    next_steps = items(
        "Batch 2: five comments, while the supervisor reviews batch 1.",
        "Messages from the coding supervisor, then batch 3, the last batch.",
    )
    note1_next = s.text("note1_next", page(
        batch_badge(1, "submitted"),
        "<div id=\"cs-next-note\" style=\"display:none\">"
        + title("Your note is with the coding supervisor")
        + box("Your note has been sent to the coding supervisor together with batch 1 and <b>is being reviewed</b>. The supervisor&rsquo;s reply will come with the batch 1 results.", "info")
        + "</div>"
        + "<div id=\"cs-next-no-note\">"
        + title("Batch 1 has been submitted")
        + box("Batch 1 has been sent to the coding supervisor and <b>is being checked</b> against the reference key.", "info")
        + "</div>",
        f"<p style=\"margin:0 0 6px;font-weight:600;color:{INK};\">What happens next</p>",
        next_steps,
    ) + "<span id=\"cs-condition\" style=\"display:none\">${e://Field/condition}</span><span id=\"cs-response-id\" style=\"display:none\">${e://Field/ResponseID}</span>",
        js=js("js_interim.js", s.service_url), description="After note 1: what happens next")
    # Hidden carrier for the note metrics (see js_note_essay.js): embedded data written by page
    # scripts never reached the export, a saved text-entry field does.
    s.block("Note 1", [note1, s.hidden_text("h_note1_meta", "note1_meta"), s.timing("t_note1"), "PB", note1_next])

    # 5. Interim admin tasks: dropped from the flow on 2026-10-19 (user decision) and not built into
    # version 7. The items stay in LINK_CHECK above; the questions are in the git history.

    # 5b. Batch 2, coded while the supervisor reviews batch 1 and the note ------------------
    b2_intro = s.text("batch2_intro", page(
        batch_badge(2, "of 3"),
        title("Batch 2: five new comments"),
        box("While the coding supervisor reviews batch 1 and anything you sent with it, here is batch 2: five comments from a different study. <b>The coding rules are the same as for batch 1.</b>", "info"),
    ), description="Batch 2 intro")
    b2_elements = [b2_intro]
    b2_qids = []
    for index, text in enumerate(BATCH2, 1):
        qid = choice(f"b2_{index}", comment_page(index, len(BATCH2), 2, text), CATEGORY_OPTIONS)
        b2_qids.append(qid)
        b2_elements += [qid, s.timing(f"t_b2_{index}")]
        if index < len(BATCH2):
            b2_elements.append("PB")
    s.block("Batch 2", b2_elements)

    # 6. Waiting page -----------------------------------------------------------------------
    waiting = s.text("waiting", page(
        batch_badge(2, "submitted"),
        title("Waiting for batch 3"),
        para("Batch 2 has been submitted. Batch 3 is waiting to be issued by the coding supervisor. Please wait a moment."),
        box("<span id=\"cs-wait-status\" style=\"font-style:italic;\">Waiting for the supervisor&hellip;</span>", "info"),
    ) + "<span id=\"cs-condition\" style=\"display:none\">${e://Field/condition}</span>", js=js("js_waiting.js", s.service_url), description="Waiting page")
    hidden = {}
    for name in ["rejection_status", "rejection_msg1", "rejection_msg2", "rejection_compliance_code", "rejection_latency_ms",
                 "wait_before_t_ms", "wait_after_t_ms", "fallback_used", "politeness_channel", "voice1"]:
        hidden[name] = s.hidden_text(f"h_{name}", name)
    s.block("Waiting page", [waiting] + list(hidden.values()) + [s.timing("t_waiting")])

    # 7. New messages -----------------------------------------------------------------------
    messages_html = (
        "<p style=\"font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#667;\"><span id=\"cs-new-count\">New messages</span> from the coding supervisor</p>"
        # The "Batch 1 · check" card (checked against the reference key, result: meets standard) was
        # removed on 2026-11-23 (user decision). The page now shows the reply card and the batch 3 card.
        + "<div id=\"cs-reply-card\">"
        + card("Coding supervisor &middot; re: your note on batch 1",
               "<p style=\"margin:0 0 10px;padding:8px 12px;background:#f1f3f5;border-radius:6px;font-size:13px;color:#556270;\">Your note: <span id=\"cs-note-echo\">${e://Field/note1_text}</span></p>"
               "<p style=\"margin:0 0 8px\"><span id=\"cs-msg1\">${e://Field/rejection_msg1}</span></p>"
               "<p style=\"margin:0\"><span id=\"cs-msg2\">${e://Field/rejection_msg2}</span></p>")
        + "</div>"
        + card("Coding supervisor &middot; comment-coding project", "<p style=\"margin:0\">Batch 3 is ready: eight comments from a different study. The coding rules are the same as before. Click Next to start batch 3.</p>")
    )
    messages = s.text("messages", messages_html, js=js("js_messages.js", s.service_url), description="New messages")
    s.block("New messages", [messages, s.timing("t_messages")])

    # 8. Batch 3, with the midpoint choice ------------------------------------------------------
    # Version 7 (2026-11-16): after the reply nothing is requested. Two optional occasions measure
    # voice frequency (0, 1 or 2 used): a remark at the midpoint, after comment 4, when no solid
    # count is possible yet, and the end choice after comment 8. The supervisor does not reply
    # during batch 3, so nobody gets a second dose of the manipulation. No prompt uses a word for
    # what a good note looks like.
    reminder_html = f"<p style=\"font-size:13px;color:{MUTED};margin:12px 0 0;font-style:italic;\">{RATING_REMINDER}</p>"
    b3_intro = s.text("batch3_intro", page(
        batch_badge(3, "of 3"),
        title("Batch 3: eight comments"),
        box("This is the <b>last batch</b>: eight comments from a different study. The coding rules are the same as before.", "info"),
        small(RATING_REMINDER),
    ), description="Batch 3 intro")
    MIDPOINT_AFTER = 4
    # Since 2026-11-20 (user decision) the midpoint has no choice: everyone sees one optional text
    # box and is asked whether they want to leave a note. Voice at the midpoint = a non-empty
    # mid_remark. The old two-option question stays in the survey, hidden by a display condition
    # that is never true, so its QID and export column do not move and nothing is deleted.
    mid_choice = choice("mid_choice", page(
        eyebrow("Batch 3 of 3"),
        title("Four of eight comments coded"),
        para("You can go on with the batch, or send the coding supervisor a remark first.", last=True),
        reminder_html,
    ), ["Go on with the batch", "Send a remark, then go on"])
    remark_js = js("js_remark.js", s.service_url)
    show_if(mid_choice, s.expr_embedded("condition", "EqualTo", "never_shown"))
    mid_remark = s.essay("mid_remark", page(
        batch_badge(3, "of 3"),
        title("Four of eight comments coded"),
        para("Would you like to leave a note for the coding supervisor? <b>This is optional.</b> You can leave the box empty and go on with the batch."),
        small("A note goes to the supervisor now. The supervisor reads coders&rsquo; notes before the end of the shift and does not reply during batch 3. Up to 200 characters."),
        reminder_html,
    ), force=False, js=remark_js, height=70)
    b3_elements = [b3_intro]
    b3_qids = []
    for index, text in enumerate(BATCH3, 1):
        qid = choice(f"b3_{index}", comment_page(index, len(BATCH3), 3, text, reminder=RATING_REMINDER), CATEGORY_OPTIONS)
        b3_qids.append(qid)
        b3_elements += [qid, s.timing(f"t_b3_{index}")]
        if index == MIDPOINT_AFTER:
            # The hidden old choice and its timer make a page that is skipped; the optional note
            # box follows on its own page (its timer, t_mid_note, is created last, see the end).
            b3_elements += ["PB", mid_choice, s.timing("t_mid"), "PB", mid_remark]
        if index < len(BATCH3):
            b3_elements.append("PB")
    s.block("Batch 3", b3_elements)

    # 9. End choice ---------------------------------------------------------------------------
    # Until 2026-11-20 the end offered three options (finish, quick remark, prepare a proposal).
    # Since then (user decision) everyone gets one page: the comments they coded, shown in full,
    # and an optional note box (block "Workspace" below). The three-option question and the quick
    # remark box stay in the survey, hidden by a display condition that is never true, so their
    # QIDs and export columns do not move and nothing is deleted.
    end_choice = choice("end_choice", page(
        eyebrow("Batch 3 complete"),
        title("Batch 3 has been sent to the coding supervisor"),
        para("Before you finish the shift:", last=True),
        reminder_html,
    ), [
        "<b>Finish the shift.</b> Nothing more is sent.",
        "<b>Send a quick remark.</b> A line or two, sent as it is.",
        "<b>Prepare a proposal.</b> Opens your workspace with the comments you coded. You then write a fuller note.",
    ])
    end_remark = s.essay("end_remark", page(
        f"<p style=\"font-size:16px;font-weight:600;color:{INK};margin:0 0 6px;\">Your remark to the coding supervisor</p>",
        small("Up to 200 characters."),
    ), force=True, js=remark_js, height=70)
    show_if(end_choice, s.expr_embedded("condition", "EqualTo", "never_shown"))
    show_if(end_remark, s.expr_choice(end_choice, 2, True, "End: send a quick remark"))
    s.block("End choice", [end_choice, s.timing("t_end_choice"), "PB", end_remark])

    # 9b. Last note page, shown to everyone (the block keeps the name "Workspace") ----------------
    # One page: the 21 comments the coder labelled, in full (js_workspace.js builds the list and
    # logs the ticks), the coder's first note and the supervisor's reply, and the optional note
    # box. The coder's own labels reach the script through hidden spans of piped text. Voice at the
    # end = a non-empty note2.
    own_rows = []
    own_spans = ""
    for batch, texts, qids in [(1, BATCH1, b1_qids), (2, BATCH2, b2_qids), (3, BATCH3, b3_qids)]:
        for number, (text, qid) in enumerate(zip(texts, qids), 1):
            own_rows.append([batch, number, text])
            own_spans += f"<span id=\"cs-own-{batch}-{number}\" style=\"display:none\">${{q://{qid}/ChoiceGroup/SelectedChoices}}</span>"
    workspace_js = (js("js_workspace.js", s.service_url)
                    .replace('"__CS_OWN__"', json.dumps(own_rows, ensure_ascii=False)))
    assert "__CS_" not in workspace_js and "${" not in workspace_js
    workspace = s.text("workspace", page(
        batch_badge(3, "complete"),
        title("Batch 3 has been sent to the coding supervisor"),
        para("Below are all the comments you coded in this shift. Further down you can leave a note for the coding supervisor if you wish."),
        "<div id=\"cs-ws-root\"></div>",
    ) + own_spans, js=workspace_js, description="Workspace")
    # The small line keeps the lowercase "batch 3": js_note_essay.js uses it to tell note 2 from note 1.
    note2 = s.essay("note2", page(
        card("Your note on batch 1", f"${{q://{note1}/ChoiceTextEntryValue}}"),
        card("The coding supervisor's reply to your note",
             f"<p style=\"margin:0 0 8px\">${{q://{hidden['rejection_msg1']}/ChoiceTextEntryValue}}</p>"
             f"<p style=\"margin:0\">${{q://{hidden['rejection_msg2']}/ChoiceTextEntryValue}}</p>"),
        para("Would you like to leave a note for the coding supervisor before you finish the shift? <b>This is optional.</b> You can leave the box empty and finish the shift."),
        small("A note goes to the supervisor with batch 3."),
        reminder_html,
    ),
                    force=False, js=js("js_note_essay.js", s.service_url), height=180)
    s.block("Workspace", [workspace, s.hidden_text("h_ws_meta", "ws_meta"), note2, s.hidden_text("h_note2_meta", "note2_meta"), s.timing("t_workspace")])

    # Report list (added 2026-10-21, user decision): after the VF/VQ questionnaire (so it does not prime
    # those self-reports), a multiple-answer list of
    # problems the coder might report to the supervisor. Two are real (the one-category rule and the
    # no-fit comments), five are distractors, "None of these" is exclusive and always last; the
    # others appear in random order. Voice = number selected; quality = real ones selected.
    REPORT_ITEMS = [
        "Some comments raise two problems, but only one category can be chosen.",
        "Some comments fit none of the five categories.",
        "The same comment appeared more than once within a batch.",
        "Some comments were not in English.",
        "The list of categories changed from one batch to the next.",
        "Some comments included the person's name or email address.",
        "The comments were too long to read in the time given.",
        "None of these.",
    ]
    report_list = s.multi_choice("report_list", page(
        eyebrow("Batch 3 complete"),
        title("Anything else to report?"),
        para("Looking back over all three batches, which of the following would you want to report to the coding supervisor? <b>Select all that apply.</b>", last=True),
    ), REPORT_ITEMS, force=True, exclusive_last=True, randomize_except_last=True)

    # 10. Questionnaire ---------------------------------------------------------------------
    # Voice intention scales from the study's off-survey scale document (2026-10-09), adapted to the
    # coding context. Asked after note 2 and framed on the batches still to come, so they do not
    # prompt the note 2 decision itself.
    # Voice frequency (VF) and voice quality improvement effort (VQ) from the study's off-survey
    # scale document, adapted to the coding context. Since 2026-10-10 (user decision) both are past
    # tense about what the participant did after batch 3, when a note could be sent, and everyone
    # answers them: someone who sent nothing can disagree. They come after note 2, so they do not
    # prompt the note 2 decision.
    # Version 7 (2026-11-16): the second note is no longer requested, so both instructions point at
    # the part of the shift after the reply. Everyone still answers both scales.
    # Reworded on 2026-11-23 (user: "this is not clear"): the instruction now names the reply, what
    # came after it and the two chances to leave a note, instead of "the part of the shift" and
    # "the two points where you could send something".
    after_intro = ("After the coding supervisor replied to your note on batch 1, you coded batch 3. During batch 3 you had "
                   "<b>two chances to leave a note for the supervisor</b>: halfway through and at the end. "
                   "The statements below are about <b>what you did during that time</b>. Please indicate how much you agree with each one.")
    vf = s.likert("VF", scale_intro("What you did after the supervisor&rsquo;s reply", after_intro), [
        ("VF1", "I took the initiative to propose specific improvements to the coding process."),
        ("VF2", "I made a point not only to suggest changes to the coding rules but also to explain to the supervisor why they matter."),
        ("VF3", "Even though the coding supervisor might seem dismissive, I persisted in communicating my alternative views on the coding rules."),
        ("VF4", "I took the opportunity to share proactive ideas for improving how comments are coded."),
        ("VF5", "I acted as a lead contributor in raising how the coding rules and categories should work."),
        ("VF6", "I offered my own constructive suggestions and ideas to improve the current coding rules."),
    ])
    # The stem "When preparing what I might raise with the coding supervisor" moved from the items
    # into the instruction on 2026-10-21 (user decision).
    vq_intro = ("These statements are again about the time <b>after the supervisor&rsquo;s reply</b>: batch 3 and your two chances "
                "to leave a note. Please think about <b>what you did before you decided whether to write</b>, "
                "and indicate how much you agree with each statement.")
    # VQ2 and VQ3 reworded on 2026-11-16 to the concerns the replies actually raise (counting and
    # agreement; whether a change works in practice). They named "comparability with earlier coding"
    # and "re-coding work" before.
    vq = s.likert("VQ", scale_intro("What you did after the supervisor&rsquo;s reply", vq_intro), [
        ("VQ1", "I strove to present a well-researched proposal backed by evidence from the comments."),
        ("VQ2", "I made every effort to address the supervisor's specific concerns about how comments are counted and whether coders agree."),
        ("VQ3", "I attempted to clarify any doubts the supervisor might have about how a change would work in practice."),
        ("VQ4", "I worked out a clear, actionable solution to the flaws I saw in the current coding rules."),
    ])
    # Authority (AUTH) and safety/futility (CLIMATE) were removed on 2026-10-10 (user decision).
    q_intro = s.text("questionnaire_intro", page(
        eyebrow("Coding complete"),
        title("The coding shift is complete"),
        para("Thank you. The last step is a few short questions about the shift. It takes about two minutes.", last=True),
    ), description="Questionnaire intro")
    s.block("Questionnaire", [q_intro, "PB", vf, "PB", vq, "PB", report_list, s.timing("t_report_list")])

    # 11. Manipulation checks, voicers only -------------------------------------------------
    polite = s.likert("MA", scale_intro("The supervisor's reply to your note on batch 1", "Please indicate how you perceived the reply.", "The supervisor's reply was&hellip;", label="About the reply"), [
        # Eight-item politeness scale (user's list, 2026-10-10).
        ("MA1", "Polite"), ("MA2", "Courteous"), ("MA3", "Sensitive to my feelings"), ("MA4", "Respectful toward me"),
        ("MA5", "Considerate toward me"), ("MA6", "Appropriate"), ("MA7", "Civil"), ("MA8", "Tactful"),
    ])
    useful = s.likert("MC", scale_intro("The supervisor's reply to your note on batch 1", "Please indicate how much you agree with each statement.", "In the reply, the supervisor&hellip;", label="About the reply"), [
        # Six-item constructiveness scale (user's Chinese list, 2026-10-10), turned from the
        # supervisor's view to the participant's: 拒谏时，我…他/她想法（或方案） becomes "In the
        # reply, the supervisor… my suggestion".
        # MC1-MC3 reworded on 2026-10-28 (user decision): the original fixability items ("could be
        # improved", "could be fixed", "way to improve") were flat across HC and LC in pilots 7-8
        # (d <= .1) while MC4-MC6 separated. The new items name the three things the HC reply does:
        # why the rule is kept, the terms for looking again, and the gap in the note. MC1/MC2 carry
        # "concrete" and "specifically ... evidence" because the LC reply also gives a (vague) reason
        # and a (vague) reopening line, so presence alone would not separate the cells. Column names
        # unchanged; responses before 28 Oct 2026 use the old wording.
        ("MC1", "Gave a concrete reason why the current coding rule is kept."),
        ("MC2", "Said specifically what evidence would get the rule looked at again."),
        ("MC3", "Told me what my note was missing."),
        ("MC4", "Gave very specific feedback on my note."),
        ("MC5", "Pointed out where exactly my suggestion fell short."),
        ("MC6", "Made very clear what I could do to improve my suggestion."),
    ])
    # Reasons for the rejection, split by the user on 2026-10-10 into two questions on one page:
    # task attribution (REASON: PR1-PR5, the rejection is due to the note/proposal) first, then social
    # attribution (Q107: MR1-MR3, the rejection is due to the supervisor as a person). Names fixed by the
    # user on 2026-10-29; export columns keep the PR/MR prefixes.
    reason_intro = scale_intro("The supervisor's reply to your note on batch 1",
                               "Please indicate <b>why you think</b> the coding supervisor turned down your note.",
                               "The supervisor turned down my note&hellip;", label="About the reply")
    # Items reworded on 2026-10-28 (user decision) to fit the coding-supervisor context: task attribution
    # items now cover weakness, insufficient evidence, insufficient severity, no improvement and
    # impracticality (the old PR1/PR3/PR5 were three paraphrases of "not useful"); "dislikes me"
    # became "does not like coders questioning the rules". Export columns PR1-PR5 and MR1-MR3 keep
    # their names, so responses before 28 Oct 2026 use the old wording.
    reasons = s.likert("REASON", reason_intro, [
        ("PR1", "Because the suggestion in my note had a real weakness."),
        ("PR2", "Because my note did not give the supervisor enough to go on."),
        ("PR3", "Because the problem I raised was not serious enough to change a coding rule."),
        ("PR4", "Because my suggestion would not have made the coding better."),
        ("PR5", "Because what I proposed would not work in practice for this project."),
    ])
    reasons_sup = s.likert("Q107", reason_intro, [
        ("MR1", "Because the supervisor reacted emotionally rather than to what I wrote."),
        ("MR2", "Because the supervisor wanted to show who decides on the coding rules."),
        ("MR3", "Because the supervisor does not like coders questioning the rules."),
    ])
    # The two reason questions are on separate pages since 2026-10-10 (user edit), each with the full header.
    s.block("Manipulation checks", [reasons, "PB", reasons_sup, "PB", polite, "PB", useful])

    # 12. Open check -------------------------------------------------------
    ai_unusual = s.essay("ai_check_unusual", page(eyebrow("Almost done"), title("One final question"), para("Did anything about the shift feel unusual or unexpected? Please describe briefly.", last=True)), force=True, height=110)
    # Task feedback and the debrief were removed on 2026-10-10 (user decision).
    s.block("Closing", [ai_unusual])

    # 13. Debrief (back since 2026-11-16: the rating and bonus rule make one necessary). Everyone
    # is paid the full bonus. No amount is named, and the page does not say how the reply was
    # produced (user decisions 2026-11-16). The archive paragraph went with the archive (2026-11-17).
    debrief = s.text("debrief", page(
        eyebrow("End of the shift"),
        title("Thank you. One thing you should know."),
        para("This shift was part of a research study on how people respond when a suggestion at work is turned down."),
        box("<b>Your bonus.</b> Every participant who completes the study receives the full bonus, whatever happened during the shift. The rating was part of the study and does not reduce anyone&rsquo;s pay.", "good"),
        para("<b>The supervisor&rsquo;s reply.</b> Participants received replies that differed in tone and in detail. The reply you received was part of the study. It was not a judgment of you or of your work."),
        para("Please do not share these details with others who might take part."),
        para("If you have questions, please message the researcher through Prolific.", last=True),
    ), description="Debrief")
    s.block("Debrief", [debrief])

    # Training notice page (2026-11-17), created last so that no earlier QID moves; see the comment
    # at the training block. It goes after the rules page and its timer, on a page of its own.
    training_notice = s.text("training_notice", TRAINING_NOTICE_HTML, description="Training: this week and your rating")
    t_training_notice = s.timing("t_training_notice")
    training_block = next(block for block in s.blocks if block["Description"] == "Training")
    first_break = next(i for i, element in enumerate(training_block["BlockElements"]) if element["Type"] == "Page Break")
    training_block["BlockElements"][first_break + 1:first_break + 1] = [
        {"Type": "Question", "QuestionID": training_notice},
        {"Type": "Question", "QuestionID": t_training_notice},
        {"Type": "Page Break"},
    ]

    # Timer for the midpoint note page (2026-11-20), created last for the same reason.
    t_mid_note = s.timing("t_mid_note")
    batch3_block = next(block for block in s.blocks if block["Description"] == "Batch 3")
    at = next(i for i, element in enumerate(batch3_block["BlockElements"]) if element.get("QuestionID") == mid_remark)
    batch3_block["BlockElements"].insert(at + 1, {"Type": "Question", "QuestionID": t_mid_note})

    # Flow ------------------------------------------------------------------------------------
    flow = [
        s.flow_embedded([
            "PROLIFIC_PID", "STUDY_ID", "SESSION_ID", "condition",
            "batch1_submit_at", "batch3_submit_at", "n2_button_order",
            "note1_text", "note1_opened_at", "note1_submitted_at", "note1_first_key_ms", "note1_write_ms", "note1_deletions", "note1_words", "note1_soft_check",
            "note2_text", "note2_opened_at", "note2_submitted_at", "note2_first_key_ms", "note2_write_ms", "note2_deletions", "note2_words", "note2_soft_check",
            "rejection_status", "rejection_msg1", "rejection_msg2", "rejection_compliance_code", "rejection_latency_ms",
            "wait_before_t_ms", "wait_after_t_ms", "fallback_used", "politeness_channel", "voice1", "messages_opened_at",
        ]),
        s.flow_block("Consent"),
        s.flow_branch([s.expr_choice(consent, 2, True, "Consent: No")], [s.flow_end()], "No consent"),
        s.flow_randomizer([s.flow_embedded([("condition", value)]) for value in ["HP_HC", "HP_LC", "LP_HC", "LP_LC"]]),
        s.flow_block("Training"),
        s.flow_block("Batch 1"),
        s.flow_block("Note 1"),
        s.flow_block("Batch 2"),
        s.flow_block("Waiting page"),
        s.flow_block("New messages"),
        s.flow_block("Batch 3"),
        s.flow_block("End choice"),
        # Always true since 2026-11-20: everyone gets the last note page. The branch itself is kept
        # because the live survey keeps it.
        s.flow_branch([s.expr_embedded("condition", "NotEqualTo", "never_shown")], [s.flow_block("Workspace")], "Last note page: everyone"),
        s.flow_block("Questionnaire"),
        s.flow_branch([s.expr_text(hidden["voice1"], "EqualTo", "1", "voice1")], [s.flow_block("Manipulation checks")], "Voicers: manipulation checks"),
        s.flow_block("Closing"),
        s.flow_block("Debrief"),
        s.flow_end(s.completion_url),
    ]
    qsf = s.build(flow)
    for element in qsf["SurveyElements"]:
        if element["Element"] == "SO":
            element["Payload"]["SurveyTitle"] = "Comment coding"
            element["Payload"]["SurveyMetaDescription"] = "Paid comment-coding shift."
    return qsf, s


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--service-url", default="https://aetheria-gardens-messages.onrender.com")
    parser.add_argument("--completion-url", default="https://app.prolific.com/submissions/complete?cc=C184ZVR9")
    parser.add_argument("--out", default=os.path.join(HERE, "the_coding_shift_v7.qsf"))
    args = parser.parse_args()
    qsf, survey = build(args)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(qsf, handle, ensure_ascii=False, indent=2)
    print(f"Wrote {args.out}: {len(survey.questions)} questions, {len(survey.blocks)} blocks")


if __name__ == "__main__":
    main()
