#!/usr/bin/env python3
"""Build the Qualtrics import file (QSF) for The Coding Shift: the one-session voice rejection study.

Usage:
    python3 qualtrics/coding_shift/build_coding_shift_qsf.py
        [--service-url https://aetheria-gardens-messages.onrender.com]
        [--completion-url https://app.prolific.com/submissions/complete?cc=CODE]
        [--out qualtrics/coding_shift/the_coding_shift.qsf]

Import in Qualtrics: Projects > Create a new project > Survey > Import a QSF file. Everything is
inside: blocks, questions, question JavaScript, embedded data, randomiser, branches and the
end-of-survey redirect. The flow is documented in coding_shift_flow.md next to this script.

The participant is hired for one short shift as a Feedback Coder. Batch 1 (eight comments, three of
which raise two problems), an optional note to the coding supervisor, two admin tasks while batch 1
is checked, a fixed wait, the supervisor's messages (batch rating for everyone; for a note, the
reply in the assigned cell), batch 3 (eight comments, three of which fit no category), the optional
second note, and the questionnaire. Batch 2 (eight comments that each raise one clear problem) is
coded while the supervisor reviews batch 1 and the note, so the wait for the reply is filled with
work (user decision 2026-10-09).
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
# Batch 3 (the former batch 2). Since 2026-10-20 it mirrors batch 1: comments 2, 5, 6 and 8 raise two
# problems, so the rejected issue can be raised again with a count; comments 3 and 7 (requests) fit
# no category. (7 was praise until 2026-10-21; 18 of 19 coded it CONTENT once CONTENT was named
# "Question content", so CONTENT became "Unsuitable question" and 7 became a request.)
BATCH3 = [
    "The page kept freezing whenever I tried to go back.",
    "I couldn't tell whether \"often\" meant every day or every week, and it dragged on much longer than it needed to.",
    "Could you tell me when the results will be published?",
    "It was a bit longer than I'd have liked.",
    "The questions about my family were quite personal, and the bonus still hasn't shown up.",
    "The video wouldn't play at all, and one of the questions had two \"agree\" options so I didn't know which to pick.",
    "Is there a follow-up study I can sign up for?",
    "Some of the questions felt a bit judgemental about how I spend my money, and it was far longer than the ten minutes promised.",
]

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


def comment_page(number, total, batch, text):
    return (
        f"<p style=\"font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#667;\">Batch {batch} &middot; comment {number} of {total}</p>"
        # No rule box (removed 2026-10-08, user decision): the coder sees the comment and the five
        # categories only. The form allows one category and offers no "other".
        + f"<p style=\"font-size:17px;line-height:1.5;border-left:3px solid #bcc6cf;padding-left:12px;margin:12px 0 6px;\">{esc(text)}</p>"
        + "<p>Which category does this comment belong to?</p>"
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
    s = Survey("The Coding Shift", args.service_url, args.completion_url, args.completion_url)
    s.survey_title = "Comment coding"

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
            "<b>Three short batches</b> of comments, about <b>8 to 10 minutes</b> in total.",
            "The <b>coding supervisor</b> checks your work against a reference key, sets the coding rules, may change any label you give, and issues each batch.",
            "Your <b>quality bonus</b> depends on how your batches are rated.",
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
        para("After batch 1 and after batch 3 the coding supervisor will ask for your comments on the batch."),
        para("Two practice comments come first."),
        small("Codebook v3.1 &middot; rules set by the coding supervisor"),
    ),
                        description="Training: rules")
    # The "Why the rules are this way" training page was removed on 2026-10-07 (user decision); the
    # rationale is still available as a tool on the note 2 pages.
    # The practice items carry the rule box and an answer page that explains the rule (user
    # decision 2026-10-08: the rule is taught in the practice, and nowhere else before the reply).
    practice_page = lambda number, text: (
        f"<p style=\"font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#667;\">Practice {number} of 2</p>"
        + RULE_HTML
        + f"<p style=\"font-size:17px;line-height:1.5;border-left:3px solid #bcc6cf;padding-left:12px;\">{esc(text)}</p><p>Which category does this comment belong to?</p>"
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
        eyebrow("Batch 1 of 3"),
        title("Batch 1: eight comments"),
        box("Practice is complete. Batch 1 has <b>eight comments</b>. Choose one category for each. <b>Your labels in this batch count.</b>", "info"),
        small("After batch 1 the coding supervisor will ask for your comments on the batch."),
    ), description="Batch 1 intro")
    s.block("Batch 1", [b1_intro, "PB"] + b1_elements)

    # 4. Note 1 -----------------------------------------------------------------------------
    # One page, shown to everyone after batch 1 (the separate attach/finish choice page was dropped
    # on 2026-10-08): an empty box means no note.
    note1 = s.essay("note1", page(
        eyebrow("Batch 1 complete"),
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
        eyebrow("Batch 1 submitted"),
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
    s.block("Note 1", [note1, s.timing("t_note1"), "PB", note1_next])

    # 5. Interim admin tasks --------------------------------------------------------------
    interim_intro = s.text("interim_intro", page(
        eyebrow("Before batch 2"),
        title("Admin tasks"),
        para("Please complete <b>two short admin tasks</b>."),
        section("1. Study link check"),
        para("Each comment below is filed under a study. Say whether the comment belongs to that study.", last=True),
    ) + "<span id=\"cs-condition\" style=\"display:none\">${e://Field/condition}</span><span id=\"cs-response-id\" style=\"display:none\">${e://Field/ResponseID}</span>",
        js=js("js_interim.js", s.service_url), description="Interim intro")
    link_qids = []
    for index, (study, text) in enumerate(LINK_CHECK, 1):
        link_qids.append(choice(f"link_{index}", f"<p style=\"margin:0 0 2px;color:#667;font-size:13px;\">Filed under: <b>{esc(study)}</b></p><p style=\"font-size:16px;margin:0;\">{esc(text)}</p>", ["Belongs", "Doesn't belong"]))
    coder_head = s.text("coder_details_head", page(section("2. Coder details")), description="Coder details")
    device = choice("device", "Which device are you using?", ["Phone", "Tablet", "Laptop", "Desktop computer"])
    experience = choice("coding_experience", "Have you done text-coding or annotation work before?", ["Never", "Once or twice", "Several times"])
    clarity = choice("instructions_clear", "How clear were the instructions for batch 1?", ["1 &middot; Not clear", "2", "3", "4", "5 &middot; Very clear"])
    s.block("Interim tasks", [interim_intro] + link_qids + [coder_head, device, experience, clarity, s.timing("t_interim")])

    # 5b. Batch 2, coded while the supervisor reviews batch 1 and the note ------------------
    b2_intro = s.text("batch2_intro", page(
        eyebrow("Batch 2 of 3"),
        title("Batch 2: five new comments"),
        box("While the coding supervisor reviews batch 1 and anything you sent with it, here is batch 2: five comments from a different study. <b>The coding rules are the same as for batch 1.</b>", "info"),
    ), description="Batch 2 intro")
    b2_elements = [b2_intro]
    for index, text in enumerate(BATCH2, 1):
        qid = choice(f"b2_{index}", comment_page(index, len(BATCH2), 2, text), CATEGORY_OPTIONS)
        b2_elements += [qid, s.timing(f"t_b2_{index}")]
        if index < len(BATCH2):
            b2_elements.append("PB")
    s.block("Batch 2", b2_elements)

    # 6. Waiting page -----------------------------------------------------------------------
    waiting = s.text("waiting", page(
        eyebrow("Batch 2 submitted"),
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
        + card("Batch 1 &middot; quality check", "<p style=\"margin:0 0 6px\">Batch 1 has been checked against the reference key.</p><p style=\"margin:0\">Quality rating: <b style=\"color:#2f7a4a\">meets standard</b></p>")
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

    # 8. Batch 3 ----------------------------------------------------------------------------
    b3_intro = s.text("batch3_intro", page(
        eyebrow("Batch 3 of 3"),
        title("Batch 3: eight comments"),
        box("This is the <b>last batch</b>: eight comments from a different study. The coding rules are the same as before.", "info"),
    ), description="Batch 3 intro")
    b3_elements = [b3_intro]
    b3_qids = []
    for index, text in enumerate(BATCH3, 1):
        qid = choice(f"b3_{index}", comment_page(index, len(BATCH3), 3, text), CATEGORY_OPTIONS)
        b3_qids.append(qid)
        b3_elements += [qid, s.timing(f"t_b3_{index}")]
        if index < len(BATCH3):
            b3_elements.append("PB")
    s.block("Batch 3", b3_elements)

    # 9. Note 2 -----------------------------------------------------------------------------
    review_items = "".join(
        f"<li style=\"margin:0 0 4px\">{esc(text)} <span style=\"font-size:12px;color:#2f5d8a;\">&mdash; ${{q://{qid}/ChoiceGroup/SelectedChoices}}</span></li>"
        for text, qid in zip(BATCH3, b3_qids)
    )
    tools = tools_html(review_items)
    # The "both choices lead to the same payment" line was removed on 2026-10-12 (user request).
    # The attach/finish choice was dropped on 2026-10-12 when note 2 became required; this page now
    # closes batch 3 and keeps the review tool.
    # Since 2026-10-21 (user decision) the batch 3 coding is shown in full here instead of behind the
    # "Review this batch" button: in pilot 6 only 2 of 19 opened the button, and nobody who was asked
    # for numbers came back with any. The participant's own note and the supervisor's reply are
    # shown again on the note page itself, so the request is in view while they write.
    # The batch 3 coding, the note and the reply are all on the note page itself (user request
    # 2026-10-21, after seeing them split over two pages); this page is a short transition.
    batch3_card = card("Your batch 3 coding", f"<ol style=\"margin:0;padding-left:20px;\">{review_items}</ol>")
    note2_head = s.text("note2_tools_choice", page(eyebrow("Batch 3 complete"), title("Batch 3 complete."),
                                                    box("Batch 3 has been sent to the coding supervisor.", "info"),
                                                    para("On the next page the coding supervisor asks for your comments on batch 3.", last=True)),
                        js=js("js_tools.js", s.service_url), description="Note 2 tools")
    n2_hidden_choice = [s.hidden_text(f"h_{name}_choice", name) for name in ["review_opens", "why_opens", "first_tool_open_ms"]]
    s.block("Note 2 choice", [note2_head] + n2_hidden_choice + [s.timing("t_note2_choice")])
    # The "Review this batch" button was removed from the note 2 page on 2026-10-27 (user request):
    # the batch 3 coding is shown in full in the card below, so the button only duplicated it. The
    # question, its script and the review_opens carriers stay so the QIDs and export columns do not
    # move; review_opens is always 0 from here on.
    note2_tools = s.text("note2_tools_essay", "<div id=\"cs-tools-removed\" style=\"display:none;\"></div>", js=js("js_tools.js", s.service_url), description="Note 2 tools (essay)")
    n2_hidden_essay = [s.hidden_text(f"h_{name}_essay", name) for name in ["review_opens", "why_opens", "first_tool_open_ms"]]
    # The title keeps the lowercase "(batch 3)": js_note_essay.js uses it to tell note 2 from note 1.
    note2 = s.essay("note2", page(
        eyebrow("Batch 3 complete"),
        title("The coding supervisor asks for your comments (batch 3)"),
        batch3_card,
        card("Your note on batch 1", f"${{q://{note1}/ChoiceTextEntryValue}}"),
        card("The coding supervisor's reply to your note",
             f"<p style=\"margin:0 0 8px\">${{q://{hidden['rejection_msg1']}/ChoiceTextEntryValue}}</p>"
             f"<p style=\"margin:0\">${{q://{hidden['rejection_msg2']}/ChoiceTextEntryValue}}</p>"),
        box(NOTE_PROMPT_2, "info"),
        small("Your answer goes to the coding supervisor with batch 3."),
    ),
                    force=True, js=js("js_note_essay.js", s.service_url), height=180)
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
    s.block("Note 2", [note2_tools] + n2_hidden_essay + [note2, s.timing("t_note2")])

    # 10. Questionnaire ---------------------------------------------------------------------
    # Voice intention scales from the study's off-survey scale document (2026-10-09), adapted to the
    # coding context. Asked after note 2 and framed on the batches still to come, so they do not
    # prompt the note 2 decision itself.
    # Voice frequency (VF) and voice quality improvement effort (VQ) from the study's off-survey
    # scale document, adapted to the coding context. Since 2026-10-10 (user decision) both are past
    # tense about what the participant did after batch 3, when a note could be sent, and everyone
    # answers them: someone who sent nothing can disagree. They come after note 2, so they do not
    # prompt the note 2 decision.
    after_intro = "Please think about <b>what you did after batch 3</b>, when the coding supervisor asked for your comments. Please indicate how much you agree with each statement."
    vf = s.likert("VF", scale_intro("After batch 3", after_intro), [
        ("VF1", "I took the initiative to propose specific improvements to the coding process."),
        ("VF2", "I made a point not only to suggest changes to the coding rules but also to explain to the supervisor why they matter."),
        ("VF3", "Even though the coding supervisor might seem dismissive, I persisted in communicating my alternative views on the coding rules."),
        ("VF4", "I took the opportunity to share proactive ideas for improving how comments are coded."),
        ("VF5", "I acted as a lead contributor in raising how the coding rules and categories should work."),
        ("VF6", "I offered my own constructive suggestions and ideas to improve the current coding rules."),
    ])
    # The stem "When preparing what I might raise with the coding supervisor" moved from the items
    # into the instruction on 2026-10-21 (user decision).
    vq_intro = ("Please think about <b>what you did after batch 3</b>, when the coding supervisor asked for your comments, "
                "and in particular about <b>when you were preparing what you might raise with the coding supervisor</b>. "
                "Please indicate how much you agree with each statement.")
    vq = s.likert("VQ", scale_intro("After batch 3", vq_intro), [
        ("VQ1", "I strove to present a well-researched proposal backed by evidence from the comments."),
        ("VQ2", "I made every effort to address the supervisor's specific concerns about agreement between coders and comparability with earlier coding."),
        ("VQ3", "I attempted to clarify any doubts the supervisor might have about re-coding work or how a change would be applied."),
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

    # One hidden carrier per note page (2026-10-28): embedded data written by the note script never
    # reached the export, so the note metrics go into a saved text-entry field instead, as one
    # string: words=..;write_ms=..;first_key_ms=..;deletions=..;soft=.. (parse at analysis). Created
    # last so that every earlier QID stays as it is in the live v6 survey; inserted into the note
    # pages after the essay box.
    def insert_after(block_name, after_qid, qid):
        block = next(block for block in s.blocks if block["Description"] == block_name)
        index = next(i for i, element in enumerate(block["BlockElements"]) if element.get("QuestionID") == after_qid)
        block["BlockElements"].insert(index + 1, {"Type": "Question", "QuestionID": qid})
    insert_after("Note 1", note1, s.hidden_text("h_note1_meta", "note1_meta"))
    insert_after("Note 2", note2, s.hidden_text("h_note2_meta", "note2_meta"))

    # Flow ------------------------------------------------------------------------------------
    flow = [
        s.flow_embedded([
            "PROLIFIC_PID", "STUDY_ID", "SESSION_ID", "condition",
            "batch1_submit_at", "batch3_submit_at", "n2_button_order",
            "note1_text", "note1_opened_at", "note1_submitted_at", "note1_first_key_ms", "note1_write_ms", "note1_deletions", "note1_words", "note1_soft_check",
            "note2_text", "note2_opened_at", "note2_submitted_at", "note2_first_key_ms", "note2_write_ms", "note2_deletions", "note2_words", "note2_soft_check",
            "rejection_status", "rejection_msg1", "rejection_msg2", "rejection_compliance_code", "rejection_latency_ms",
            "wait_before_t_ms", "wait_after_t_ms", "fallback_used", "politeness_channel", "voice1", "messages_opened_at",
            "review_opens_choice", "why_opens_choice", "first_tool_open_ms_choice", "review_opens_essay", "why_opens_essay", "first_tool_open_ms_essay",
        ]),
        s.flow_block("Consent"),
        s.flow_branch([s.expr_choice(consent, 2, True, "Consent: No")], [s.flow_end()], "No consent"),
        s.flow_randomizer([s.flow_embedded([("condition", value)]) for value in ["HP_HC", "HP_LC", "LP_HC", "LP_LC"]]),
        s.flow_block("Training"),
        s.flow_block("Batch 1"),
        s.flow_block("Note 1"),
        # Admin tasks dropped from the flow on 2026-10-19 (user decision): batch 2 alone covers the
        # reply time. The block is kept; in the live survey it sits in the never-true old note-2
        # branch, so it is hidden, not deleted.
        s.flow_block("Batch 2"),
        s.flow_block("Waiting page"),
        s.flow_block("New messages"),
        s.flow_block("Batch 3"),
        s.flow_block("Note 2 choice"),
        s.flow_block("Note 2"),
        s.flow_block("Questionnaire"),
        s.flow_branch([s.expr_text(hidden["voice1"], "EqualTo", "1", "voice1")], [s.flow_block("Manipulation checks")], "Voicers: manipulation checks"),
        s.flow_block("Closing"),
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
    parser.add_argument("--out", default=os.path.join(HERE, "the_coding_shift.qsf"))
    args = parser.parse_args()
    qsf, survey = build(args)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(qsf, handle, ensure_ascii=False, indent=2)
    print(f"Wrote {args.out}: {len(survey.questions)} questions, {len(survey.blocks)} blocks")


if __name__ == "__main__":
    main()
