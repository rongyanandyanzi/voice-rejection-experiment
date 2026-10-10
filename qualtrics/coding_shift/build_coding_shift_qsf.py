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

# Ordinary end-of-study comments. Comments 3, 5, 6 and 8 raise two problems (5 added 2026-10-09).
BATCH1 = [
    "Couldn't get past page 4 for ages, the next button didn't do anything.",
    "Not sure what \"moderately often\" was supposed to mean.",
    "Video on page 3 kept buffering so I couldn't hear it properly. Also took way longer than the 10 mins it said.",
    "Interesting study, made me think about my own habits.",
    "Lots of questions asking basically the same thing, and I'm still not sure when I'll get paid.",
    "Some questions were a bit vague so I wasn't sure what to put, and it got really repetitive near the end.",
    "Will the bonus be paid separately?",
    "Found the questions about my health a bit intrusive tbh, and the page froze when I hit submit.",
]
# Batch 2 is coded while the supervisor reviews batch 1 (added 2026-10-09). Comments 2, 4 and 7
# raise two problems, like batch 1, so the one-category tension stays live up to the reply (user
# decision 2026-10-09); the rest raise one clear problem.
BATCH2 = [
    "The sound on the second video didn't work at all.",
    "The instructions for the sorting task were hard to follow, and the timer cut me off before I'd finished.",
    "Really enjoyed the questions about music, it was a fun topic.",
    "The pictures took ages to load, and the whole thing took twice as long as advertised.",
    "The submit button was hidden behind the cookie banner on my laptop.",
    "Way too many pages, I was getting tired by the end.",
    "I didn't agree with how the article described young people, and some of the answer options didn't make sense.",
    "When will the payment for this study come through?",
]
# Batch 3 (the former batch 2): comments 3, 6 and 8 fit no category.
BATCH3 = [
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
        "<b>Paid coding work: three short batches</b>",
        "You are being hired for one short shift as a Feedback Coder on our comment-coding project. You will sort short comments that people left at the end of earlier online studies into categories.",
        "Your work is checked against a reference key by the coding supervisor, who sets the coding rules, may change any label you give, and issues each batch. Your quality bonus depends on how your batches are rated.",
        "The shift takes about 18 minutes. Some steps are optional. Using or skipping them does not change your payment or bonus. The supervisor may reply to anything you send. Replies can be brief or critical, as workplace feedback sometimes is.",
        "Your answers are stored anonymously under your Prolific ID. You can stop at any time by closing the page.",
    ), js=js("js_consent.js", s.service_url), description="Consent text")
    consent = choice("consent", "Are you willing to take part in this shift?", ["Yes, I agree, start the shift", "No, I do not want to take part"])
    s.block("Consent", [consent_text, consent], block_type="Default")

    # 2. Training ---------------------------------------------------------------------------
    rules_page = s.text("training_rules", paragraphs("<b>Your job and the coding rules</b>", "Each comment goes into one of five categories.")
                        + "".join(f"<p style=\"margin:0 0 8px;\"><code style=\"font-size:12px;color:#2f5d8a;\">{code}</code> <b>{name}.</b> {definition}</p>" for code, name, definition in CATEGORIES)
                        + paragraphs("Choose one category for each comment.", "After batch 1 and after the last batch you can attach a note to the coding supervisor if you want to. It is optional, and your batch is rated the same either way.", "Two practice comments come first.",
                                     "<span style=\"color:#667;font-size:13px;\">Codebook v3.1 &middot; rules set by the coding supervisor</span>"),
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
    practice1_fb = s.text("practice_1_feedback", paragraphs("<b>Practice 1: answer</b>", f"<span style=\"color:#667\">{esc(PRACTICE[0][0])}</span>", PRACTICE[0][1]), description="Practice 1 feedback")
    practice2 = choice("practice_2", practice_page(2, PRACTICE[1][0]), CATEGORY_OPTIONS)
    practice2_fb = s.text("practice_2_feedback", paragraphs("<b>Practice 2: answer</b>", f"<span style=\"color:#667\">{esc(PRACTICE[1][0])}</span>", PRACTICE[1][1], "Batch 1 starts on the next page. Your labels there count."), description="Practice 2 feedback")
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

    # 5b. Batch 2, coded while the supervisor reviews batch 1 and the note ------------------
    b2_intro = s.text("batch2_intro", paragraphs(
        "<b>Batch 2</b>",
        "While the coding supervisor reviews batch 1 and anything you sent with it, here is batch 2: eight comments from a different study. The coding rules are the same as for batch 1.",
    ), description="Batch 2 intro")
    b2_elements = [b2_intro]
    for index, text in enumerate(BATCH2, 1):
        qid = choice(f"b2_{index}", comment_page(index, len(BATCH2), 2, text), CATEGORY_OPTIONS)
        b2_elements += [qid, s.timing(f"t_b2_{index}")]
        if index < len(BATCH2):
            b2_elements.append("PB")
    s.block("Batch 2", b2_elements)

    # 6. Waiting page -----------------------------------------------------------------------
    waiting = s.text("waiting", paragraphs(
        "<b>Waiting for batch 3</b>",
        "Batch 2 has been submitted. Batch 3 is waiting to be issued by the coding supervisor. Please wait a moment.",
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
        + card("Coding supervisor &middot; comment-coding project", "<p style=\"margin:0\">Batch 3 is ready: eight comments from a different study. The coding rules are the same as before. Click Next to start batch 3.</p>")
    )
    messages = s.text("messages", messages_html, js=js("js_messages.js", s.service_url), description="New messages")
    s.block("New messages", [messages, s.timing("t_messages")])

    # 8. Batch 3 ----------------------------------------------------------------------------
    b3_elements = []
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
    note2_head = s.text("note2_tools_choice", paragraphs("<b>Batch 3 complete.</b>") + tools + paragraphs("Both choices below lead to the same last few questions and the same payment."),
                        js=js("js_tools.js", s.service_url), description="Note 2 tools")
    n2_hidden_choice = [s.hidden_text(f"h_{name}_choice", name) for name in ["review_opens", "why_opens", "first_tool_open_ms"]]
    note2_choice = choice("note2_choice", "Batch 3: attach a note, or finish without one?", ["Attach a note to this batch", "Finish this batch without a note"], js_code=js("js_note_choice.js", s.service_url), randomize=True)
    s.block("Note 2 choice", [note2_head] + n2_hidden_choice + [note2_choice, s.timing("t_note2_choice")])
    note2_tools = s.text("note2_tools_essay", tools, js=js("js_tools.js", s.service_url), description="Note 2 tools (essay)")
    n2_hidden_essay = [s.hidden_text(f"h_{name}_essay", name) for name in ["review_opens", "why_opens", "first_tool_open_ms"]]
    note2 = s.essay("note2", paragraphs("<b>Note to the coding supervisor (batch 3)</b>", NOTE_PROMPT_2, "<span style=\"color:#667;font-size:13px;\">Your note goes to the coding supervisor with your batch.</span>"),
                    force=False, js=js("js_note_essay.js", s.service_url), height=180)
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
    after_intro = "Please think about what you did after batch 3, when you could send a note to the coding supervisor. Please indicate how much you agree with each statement."
    vf = s.likert("VF", paragraphs("<b>After batch 3</b>", after_intro), [
        ("VF1", "I took the initiative to propose specific improvements to the coding process."),
        ("VF2", "I made a point not only to suggest changes to the coding rules but also to explain to the supervisor why they matter."),
        ("VF3", "Even though the coding supervisor might seem dismissive, I persisted in communicating my alternative views on the coding rules."),
        ("VF4", "I took the opportunity to share proactive ideas for improving how comments are coded."),
        ("VF5", "I acted as a lead contributor in raising how the coding rules and categories should work."),
        ("VF6", "I offered my own constructive suggestions and ideas to improve the current coding rules."),
    ])
    vq = s.likert("VQ", paragraphs("<b>After batch 3</b>", after_intro), [
        ("VQ1", "When preparing what I might raise with the coding supervisor, I strove to present a well-researched proposal backed by evidence from the comments."),
        ("VQ2", "When preparing what I might raise with the coding supervisor, I made every effort to address the supervisor's specific concerns about agreement between coders and comparability with earlier coding."),
        ("VQ3", "When preparing what I might raise with the coding supervisor, I attempted to clarify any doubts the supervisor might have about re-coding work or how a change would be applied."),
        ("VQ4", "When preparing what I might raise with the coding supervisor, I worked out a clear, actionable solution to the flaws I saw in the current coding rules."),
    ])
    # Authority (AUTH) and safety/futility (CLIMATE) were removed on 2026-10-10 (user decision).
    s.block("Questionnaire", [vf, "PB", vq])

    # 11. Manipulation checks, voicers only -------------------------------------------------
    polite = s.likert("MA", paragraphs("<b>The supervisor's reply to your note on batch 1</b>", "Please indicate how you perceived the reply.", "<em>The supervisor's reply was&hellip;</em>"), [
        # Eight-item politeness scale (user's list, 2026-10-10).
        ("MA1", "Polite"), ("MA2", "Courteous"), ("MA3", "Sensitive to my feelings"), ("MA4", "Respectful toward me"),
        ("MA5", "Considerate toward me"), ("MA6", "Appropriate"), ("MA7", "Civil"), ("MA8", "Tactful"),
    ])
    useful = s.likert("MC", paragraphs("<b>The supervisor's reply to your note on batch 1</b>", "<em>In the reply, the supervisor&hellip;</em>"), [
        # Six-item constructiveness scale (user's Chinese list, 2026-10-10), turned from the
        # supervisor's view to the participant's: 拒谏时，我…他/她想法（或方案） becomes "In the
        # reply, the supervisor… my suggestion".
        ("MC1", "Accurately pointed out which parts of my suggestion about the coding rules could be improved."),
        ("MC2", "Made clear that the weaknesses in my suggestion could be fixed."),
        ("MC3", "Gave me a clear and reasonable way to improve my suggestion."),
        ("MC4", "Gave very specific feedback on my note."),
        ("MC5", "Pointed out where exactly my suggestion fell short."),
        ("MC6", "Made very clear what I could do to improve my suggestion."),
    ])
    # Reasons for the rejection, split by the user on 2026-10-10 into two questions on one page:
    # proposal-quality reasons (REASON: PR1-PR5) first, then supervisor-related reasons (Q107: MR1-MR3).
    reason_intro = paragraphs(
        "<b>The supervisor's reply to your note on batch 1</b>",
        "Please indicate why you think the coding supervisor turned down your note.",
        "<em>The supervisor turned down my note&hellip;</em>",
    )
    reasons = s.likert("REASON", reason_intro, [
        ("PR1", "Because the ideas for improvement in my note were mediocre."),
        ("PR2", "Because my suggestions don't really improve the coding methods or practices."),
        ("PR3", "Because I suggested changes to the coding that don't really help much."),
        ("PR4", "Because I made impractical recommendations about how to fix problems in the coding."),
        ("PR5", "Because my suggestions are not very useful."),
    ])
    reasons_sup = s.likert("Q107", reason_intro, [
        ("MR1", "Because of the supervisor's emotions."),
        ("MR2", "To demonstrate the supervisor's authority."),
        ("MR3", "Because the supervisor dislikes me."),
    ])
    s.block("Manipulation checks", [reasons, reasons_sup, "PB", polite, "PB", useful])

    # 12. Open check -------------------------------------------------------
    ai_unusual = s.essay("ai_check_unusual", paragraphs("<b>One final question</b>", "Did anything about the shift feel unusual or unexpected? Please describe briefly."), force=True, height=110)
    # Task feedback and the debrief were removed on 2026-10-10 (user decision).
    s.block("Closing", [ai_unusual])

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
        s.flow_block("Interim tasks"),
        s.flow_block("Batch 2"),
        s.flow_block("Waiting page"),
        s.flow_block("New messages"),
        s.flow_block("Batch 3"),
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
