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
reply in the assigned cell), batch 2 (eight comments, three of which fit no category), the optional
second note, and the questionnaire.
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
    ("LENGTH", "Length, pace or repetition", "How long, how fast, how repetitive or how demanding the study was."),
    ("PAYMENT", "Payment or stated time", "The fee, the bonus, or whether the time in the listing was accurate."),
    ("CONTENT", "Reaction to the subject matter", "Interest, discomfort, disagreement, or wanting to explain an answer."),
]
CATEGORY_OPTIONS = [f"<b>{code}</b> &middot; {name}" for code, name, _ in CATEGORIES]

RULE_HTML = (
    "<div style=\"border:1px solid #d9dee5;border-radius:8px;padding:10px 14px;margin:10px 0 14px;background:#f6f8fa;font-size:14px;\">"
    "<b>How to label this comment</b>"
    "<p style=\"margin:6px 0 0\">Choose one category for each comment.</p>"
    "<p style=\"margin:4px 0 0\">If a comment mentions more than one thing, choose the one it is mainly about.</p>"
    "<p style=\"margin:4px 0 0\">There is no &ldquo;other&rdquo; option. Every comment gets one of the five categories.</p>"
    "</div>"
)

RATIONALE_HTML = paragraphs(
    "<b>One category per comment.</b> The project reports how many comments fall into each category and how often two coders agree. Both are built on one label per comment. With two labels, coders agree less often and the percentages add up to more than 100.",
    "<b>Choosing the main thing.</b> Coders will sometimes judge the main point differently. That is expected; the agreement check catches large disagreements.",
    "<b>No &ldquo;other&rdquo; option.</b> A leftover category tends to fill up with anything awkward, and the counts for the five real categories shrink. Every comment is placed in the closest category instead.",
    "<b>Changing a rule.</b> Every comment already coded would have to be coded again, so rules change only when there is clear evidence the change is worth it.",
)

PRACTICE = [
    ("The audio clip on page 2 wouldn't play, so I had to guess what it said.",
     "<b>TECH.</b> The comment reports that part of the study did not work. It mentions only one thing."),
    ("Question 7 was really confusing, I wasn't sure if it meant my current job or my last one. Also a bit long.",
     "<b>WORDING.</b> The comment mentions two things and is mainly about the confusing question, so that is the category. The remark about length is not recorded."),
]

# Ordinary end-of-study comments (replaced 2026-10-08). Comments 3, 6 and 8 raise two problems.
BATCH1 = [
    "Couldn't get past page 4 for ages, the next button didn't do anything.",
    "Not sure what \"moderately often\" was supposed to mean.",
    "The image in the first task never loaded, and honestly the whole thing felt way too long.",
    "Interesting study, made me think about my own habits.",
    "Lots of questions asking basically the same thing.",
    "Some of the wording was confusing, and I think I got paid less than the advert said.",
    "Will the bonus be paid separately?",
    "Didn't like being asked about my weight, and the slider kept jumping back to the middle.",
]
BATCH2 = [
    "The page kept freezing whenever I tried to go back.",
    "The rating scale labels were the wrong way round compared to the earlier pages.",
    "Could you tell me when the results will be published?",
    "It was a bit longer than I'd have liked.",
    "The questions about my family were quite personal.",
    "Is there a follow-up study I can sign up for?",
    "The payment arrived quicker than usual, thanks.",
    "Please could you send me a summary of what you found.",
]

LINK_CHECK = [
    ("Morning routines and sleep", "Some of the questions about bedtime were hard to answer honestly."),
    ("Choosing a mobile phone plan", "The video explaining the recipe steps wouldn't play."),
    ("Commuting and travel choices", "The questions about my train journey got a bit repetitive."),
    ("Shopping for groceries online", "I wasn't sure what counted as a weekly shop."),
    ("Reading habits", "The questions about my pension were confusing."),
]

NOTE_PROMPT_1 = ("Batch 1 is complete. Before it goes to the coding supervisor, is there anything about the coding process "
                 "you'd like to tell them? For example: a problem you ran into while coding, something in the current rules "
                 "or categories that doesn't seem reasonable, or a suggestion for improving how the coding is done. Anything "
                 "you write will be read by the supervisor. This is optional.")
NOTE_PROMPT_2 = ("Is there anything about the coding process you'd like to tell the coding supervisor? For example: a "
                 "problem you ran into while coding, something in the current rules or categories that doesn't seem "
                 "reasonable, or a suggestion for improving how the coding is done. Anything you write will be read by "
                 "the supervisor.")

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
    consent_text = s.text("consent_text", paragraphs(
        "<b>Paid coding work: two short batches</b>",
        "You are being hired for one short shift as a Feedback Coder on our comment-coding project. You will sort short comments that people left at the end of earlier online studies into categories.",
        "Your work is checked against a reference key by the coding supervisor, who sets the coding rules, may change any label you give, and issues each batch. Your quality bonus depends on how your batches are rated.",
        "The shift takes about 15 minutes. Some steps are optional. Using or skipping them does not change your payment or bonus. The supervisor may reply to anything you send. Replies can be brief or critical, as workplace feedback sometimes is.",
        "Your answers are stored anonymously under your Prolific ID. You can stop at any time by closing the page.",
    ), js=js("js_consent.js", s.service_url), description="Consent text")
    consent = choice("consent", "Are you willing to take part in this shift?", ["Yes, I agree, start the shift", "No, I do not want to take part"])
    s.block("Consent", [consent_text, consent], block_type="Default")

    # 2. Training ---------------------------------------------------------------------------
    rules_page = s.text("training_rules", paragraphs("<b>Your job and the coding rules</b>", "Each comment goes into one of five categories.")
                        + "".join(f"<p style=\"margin:0 0 8px;\"><code style=\"font-size:12px;color:#2f5d8a;\">{code}</code> <b>{name}.</b> {definition}</p>" for code, name, definition in CATEGORIES)
                        + paragraphs("Choose one category for each comment.", "At the end of every batch you can attach a note to the coding supervisor if you want to. It is optional, and your batch is rated the same either way.", "Batch 1 starts on the next page.",
                                     "<span style=\"color:#667;font-size:13px;\">Codebook v3.1 &middot; rules set by the coding supervisor</span>"),
                        description="Training: rules")
    # The "Why the rules are this way" training page was removed on 2026-10-07 (user decision); the
    # rationale is still available as a tool on the note 2 pages.
    # The two practice items and their answer pages were removed on 2026-10-08 (user decision): no
    # explanation of the rule beyond the rule box itself before the reply.
    t_train = s.timing("t_training")
    s.block("Training", [rules_page, t_train])

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
    s.block("Batch 1", b1_elements)

    # 4. Note 1 -----------------------------------------------------------------------------
    # One page, shown to everyone after batch 1 (the separate attach/finish choice page was dropped
    # on 2026-10-08): an empty box means no note.
    note1 = s.essay("note1", paragraphs("<b>Note to the coding supervisor</b>", NOTE_PROMPT_1,
                                        "If there is nothing you want to tell them, leave the box empty and click Next. Either way leads to the next step and the same payment.",
                                        "<span style=\"color:#667;font-size:13px;\">Anything you write goes to the coding supervisor with your batch.</span>"),
                    force=False, js=js("js_note_essay.js", s.service_url), height=180)
    s.block("Note 1", [note1, s.timing("t_note1")])

    # 5. Interim admin tasks --------------------------------------------------------------
    interim_intro = s.text("interim_intro", paragraphs(
        "<b>Batch 1 is being checked</b>",
        "Batch 1 has been submitted and is being checked against the reference key. While it is checked, please complete two short admin tasks.",
        "<b>1. Study link check.</b> Each comment below is filed under a study. Say whether the comment belongs to that study.",
    ) + "<span id=\"cs-condition\" style=\"display:none\">${e://Field/condition}</span><span id=\"cs-response-id\" style=\"display:none\">${e://Field/ResponseID}</span>",
        js=js("js_interim.js", s.service_url), description="Interim intro")
    link_qids = []
    for index, (study, text) in enumerate(LINK_CHECK, 1):
        link_qids.append(choice(f"link_{index}", f"<p style=\"margin:0 0 2px;color:#667;font-size:13px;\">Filed under: <b>{esc(study)}</b></p><p style=\"font-size:16px;margin:0;\">{esc(text)}</p>", ["Belongs", "Doesn't belong"]))
    coder_head = s.text("coder_details_head", paragraphs("<b>2. Coder details</b>"), description="Coder details")
    device = choice("device", "Which device are you using?", ["Phone", "Tablet", "Laptop", "Desktop computer"])
    experience = choice("coding_experience", "Have you done text-coding or annotation work before?", ["Never", "Once or twice", "Several times"])
    clarity = choice("instructions_clear", "How clear were the instructions for batch 1?", ["1 &middot; Not clear", "2", "3", "4", "5 &middot; Very clear"])
    s.block("Interim tasks", [interim_intro] + link_qids + [coder_head, device, experience, clarity, s.timing("t_interim")])

    # 6. Waiting page -----------------------------------------------------------------------
    waiting = s.text("waiting", paragraphs(
        "<b>Waiting for batch 2</b>",
        "Batch 2 is waiting to be issued by the coding supervisor. Please wait a moment.",
        "<span id=\"cs-wait-status\" style=\"color:#667;font-style:italic;\">Waiting for the supervisor&hellip;</span>",
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
        + card("Coding supervisor &middot; comment-coding project", "<p style=\"margin:0\">Batch 2 is ready: eight comments from a different study. The coding rules are the same as for batch 1. Click Next to start batch 2.</p>")
    )
    messages = s.text("messages", messages_html, js=js("js_messages.js", s.service_url), description="New messages")
    s.block("New messages", [messages, s.timing("t_messages")])

    # 8. Batch 2 ----------------------------------------------------------------------------
    b2_elements = []
    b2_qids = []
    for index, text in enumerate(BATCH2, 1):
        qid = choice(f"b2_{index}", comment_page(index, len(BATCH2), 2, text), CATEGORY_OPTIONS)
        b2_qids.append(qid)
        b2_elements += [qid, s.timing(f"t_b2_{index}")]
        if index < len(BATCH2):
            b2_elements.append("PB")
    s.block("Batch 2", b2_elements)

    # 9. Note 2 -----------------------------------------------------------------------------
    review_items = "".join(
        f"<li style=\"margin:0 0 4px\">{esc(text)} <span style=\"font-size:12px;color:#2f5d8a;\">&mdash; ${{q://{qid}/ChoiceGroup/SelectedChoices}}</span></li>"
        for text, qid in zip(BATCH2, b2_qids)
    )
    tools = tools_html(review_items)
    note2_head = s.text("note2_tools_choice", paragraphs("<b>Batch 2 complete.</b>") + tools + paragraphs("Both choices below lead to the same last few questions and the same payment."),
                        js=js("js_tools.js", s.service_url), description="Note 2 tools")
    n2_hidden_choice = [s.hidden_text(f"h_{name}_choice", name) for name in ["review_opens", "why_opens", "first_tool_open_ms"]]
    note2_choice = choice("note2_choice", "Batch 2: attach a note, or finish without one?", ["Attach a note to this batch", "Finish this batch without a note"], js_code=js("js_note_choice.js", s.service_url), randomize=True)
    s.block("Note 2 choice", [note2_head] + n2_hidden_choice + [note2_choice, s.timing("t_note2_choice")])
    note2_tools = s.text("note2_tools_essay", tools, js=js("js_tools.js", s.service_url), description="Note 2 tools (essay)")
    n2_hidden_essay = [s.hidden_text(f"h_{name}_essay", name) for name in ["review_opens", "why_opens", "first_tool_open_ms"]]
    note2 = s.essay("note2", paragraphs("<b>Note to the coding supervisor (batch 2)</b>", NOTE_PROMPT_2, "<span style=\"color:#667;font-size:13px;\">Your note goes to the coding supervisor with your batch.</span>"),
                    force=False, js=js("js_note_essay.js", s.service_url), height=180)
    s.block("Note 2", [note2_tools] + n2_hidden_essay + [note2, s.timing("t_note2")])

    # 10. Questionnaire ---------------------------------------------------------------------
    vq = s.likert("VQ", paragraphs(
        "<b>A few questions about the second batch</b>",
        "The following statements are about the end of batch 2, when you could attach a second note to the coding supervisor. Please indicate how much you agree with each statement about what you actually did.",
    ), [
        ("VQ1", "Before deciding whether to send a second note, I tried to back what I might suggest with the information available to me, such as the comments in the batch."),
        ("VQ2", "Before deciding whether to send a second note, I made an effort to think through the practical concerns the supervisor would have, such as agreement between coders, comparability with earlier coding, or the extra work a change would create."),
        ("VQ3", "Before deciding whether to send a second note, I tried to anticipate the questions or doubts the supervisor might raise, and how I would answer them."),
        ("VQ4", "Before deciding whether to send a second note, I made an effort to work out a clear, actionable change rather than a general idea."),
    ])
    vf = s.likert("VF", paragraphs("<b>About the second note</b>", "Please indicate how much you agree with each statement about what you actually did at the end of batch 2."), [
        ("VF1", "I used the opportunity at the end of batch 2 to share my views on the coding process proactively."),
        ("VF2", "I put forward my own ideas about the coding process in the second note, rather than keeping them to myself."),
        ("VF3", "I raised a new point about the coding process with the supervisor at the end of batch 2."),
    ])
    authority = s.likert("AUTH", paragraphs("<b>About the coding supervisor</b>", "Please indicate how much you agree with each statement."), [
        ("AUTH1", "The coding supervisor had the authority to decide how comments are coded."),
        ("AUTH2", "The coding supervisor could overrule the labels I gave."),
        ("AUTH3", "The coding supervisor's rating decided my quality bonus."),
    ])
    climate = s.likert("CLIMATE", paragraphs("<b>Speaking up to the supervisor</b>", "Please indicate how much you agree with each statement."), [
        ("SAFE1", "It felt safe to raise concerns about the coding process with the supervisor."),
        ("SAFE2", "Raising a concern with the supervisor could have counted against me."),
        ("FUT1", "Raising a concern with the supervisor would make no difference to how the coding is done."),
        ("FUT2", "The supervisor would act on a good suggestion about the coding process."),
    ])
    s.block("Questionnaire", [vq, "PB", vf, "PB", authority, "PB", climate])

    # 11. Manipulation checks, voicers only -------------------------------------------------
    polite = s.likert("MA", paragraphs("<b>The supervisor's reply to your note on batch 1</b>", "Please indicate how you perceived the reply.", "<em>The supervisor's reply was&hellip;</em>"), [
        ("MA1", "Polite"), ("MA2", "Respectful toward me"), ("MA3", "Considerate toward me"), ("MA4", "Tactful"),
    ])
    useful = s.likert("MC", paragraphs("<b>The supervisor's reply to your note on batch 1</b>", "<em>In the reply, the supervisor&hellip;</em>"), [
        ("MC1", "Pointed to specific aspects of my note that I could actually work on."),
        ("MC2", "Made reference to clear, legitimate standards a change would have to meet."),
        ("MC3", "Made reference to specific parts of my note that were problematic."),
        ("MC4", "Provided clear enough guidance that I knew what to change."),
    ])
    s.block("Manipulation checks", [polite, "PB", useful])

    # 12. AI check, feedback, debrief -------------------------------------------------------
    ai_unusual = s.essay("ai_check_unusual", paragraphs("<b>A few final questions</b>", "Did anything about the shift feel unusual or unexpected? Please describe briefly."), force=True, height=110)
    ai_direct = choice("supervisor_ai_suspicion", paragraphs(
        "<b>One more question</b>",
        "In Prolific recruitment, studies may sometimes include AI participants. To help us protect data quality and reduce possible effects from AI participants, please answer the question below.",
        "Do you think the coding supervisor who replied to you may have been AI?",
    ), ["Yes", "No", "Not sure", "I did not receive a reply"])
    feedback = s.essay("task_feedback", paragraphs("<b>Task feedback</b>", "If you have any comments about this task, please share them with us. You may also submit without adding anything. Please do not include your name or other personal information."), force=False, height=120)
    debrief = s.text("debrief", paragraphs(
        "<b>Thank you: what this study was about</b>",
        "This study looks at how the way a supervisor turns down a suggestion affects whether people speak up again.",
        "The coding work was real, but the supervisor's written reply to a note was generated automatically, and the kind of reply was assigned at random. It did not depend on the quality of the note. Everyone receives the full quality bonus, whatever their rating.",
        "If you would like your data withdrawn, tell us through Prolific and it will be deleted. Click Next to complete the shift and return to Prolific.",
    ), description="Debrief")
    s.block("Closing", [ai_unusual, "PB", ai_direct, "PB", feedback, "PB", debrief])

    # Flow ------------------------------------------------------------------------------------
    flow = [
        s.flow_embedded([
            "PROLIFIC_PID", "STUDY_ID", "SESSION_ID", "condition",
            "batch1_submit_at", "batch2_submit_at", "n2_button_order",
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
        s.flow_block("Interim tasks"),
        s.flow_block("Waiting page"),
        s.flow_block("New messages"),
        s.flow_block("Batch 2"),
        s.flow_block("Note 2 choice"),
        s.flow_branch([s.expr_choice(note2_choice, 1, True, "Note 2: attach")], [s.flow_block("Note 2")], "Note 2 attached"),
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
    parser.add_argument("--completion-url", default="https://app.prolific.com/submissions/complete?cc=COMPLETION_CODE")
    parser.add_argument("--out", default=os.path.join(HERE, "the_coding_shift.qsf"))
    args = parser.parse_args()
    qsf, survey = build(args)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(qsf, handle, ensure_ascii=False, indent=2)
    print(f"Wrote {args.out}: {len(survey.questions)} questions, {len(survey.blocks)} blocks")


if __name__ == "__main__":
    main()
