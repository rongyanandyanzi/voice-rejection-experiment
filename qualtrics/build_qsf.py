#!/usr/bin/env python3
"""Build the Qualtrics import file (QSF) for the one-shot rejection study.

Usage:
    python3 qualtrics/build_qsf.py [--service-url https://your-service.onrender.com]
                                   [--completion-url https://app.prolific.com/submissions/complete?cc=CODE]
                                   [--tech-issue-url https://app.prolific.com/submissions/complete?cc=TECHCODE]
                                   [--out qualtrics/voice_rejection_one_shot.qsf]

Import the output in Qualtrics: Projects > Create a new project > Survey > Import a QSF file.
Everything the survey needs is inside: blocks, questions, question JavaScript, embedded data,
randomiser, branches and the end-of-survey redirect. After importing, replace the consent text
and check the Survey Flow once.
"""
import argparse
import hashlib
import uuid
import html
import json
import os
import re
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as handle:
        return handle.read()


def stable_id(prefix, seed):
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    body = "".join(ch for ch in digest if ch.isalnum())[:15]
    return f"{prefix}_{body}"


LIKERT = {
    "1": "1<br>Strongly disagree",
    "2": "2<br>Disagree",
    "3": "3<br>Neither agree nor disagree",
    "4": "4<br>Agree",
    "5": "5<br>Strongly agree",
}


class Survey:
    def __init__(self, name, service_url, completion_url, tech_issue_url, brand="ustbsem"):
        self.name = name
        self.brand = brand
        self.survey_id = stable_id("SV", name)
        self.service_url = service_url.rstrip("/")
        self.completion_url = completion_url
        self.tech_issue_url = tech_issue_url
        self.questions = []      # SQ elements
        self.blocks = []         # block payloads
        self.qid_counter = 0
        self.flow_counter = 1
        self.block_ids = {}
        self.qids = {}           # export tag -> QID

    # ---- questions -------------------------------------------------------
    def next_qid(self):
        self.qid_counter += 1
        return f"QID{self.qid_counter}"

    def add_question(self, tag, payload, description):
        qid = self.next_qid()
        payload = dict(payload)
        payload["QuestionID"] = qid
        payload["DataExportTag"] = tag
        payload.setdefault("QuestionDescription", description[:100])
        payload.setdefault("Language", [])
        payload.setdefault("DefaultChoices", False)
        payload.setdefault("DataVisibility", {"Private": False, "Hidden": False})
        self.questions.append({
            "SurveyID": self.survey_id,
            "Element": "SQ",
            "PrimaryAttribute": qid,
            "SecondaryAttribute": description[:100],
            "TertiaryAttribute": None,
            "Payload": payload,
        })
        self.qids[tag] = qid
        return qid

    def text(self, tag, html_text, js=None, description="Text"):
        payload = {
            "QuestionText": html_text,
            "QuestionType": "DB",
            "Selector": "TB",
            "Configuration": {"QuestionDescriptionOption": "UseText"},
            "ChoiceOrder": [],
            "Validation": {"Settings": {"Type": "None"}},
        }
        if js:
            payload["QuestionJS"] = js
        return self.add_question(tag, payload, description)

    def single_choice(self, tag, question_text, options, force=True, js=None):
        choices = {str(i + 1): {"Display": label} for i, label in enumerate(options)}
        payload = {
            "QuestionText": question_text,
            "QuestionType": "MC",
            "Selector": "SAVR",
            "SubSelector": "TX",
            "Configuration": {"QuestionDescriptionOption": "UseText"},
            "Choices": choices,
            "ChoiceOrder": [str(i + 1) for i in range(len(options))],
            "Validation": force_validation(force),
            "NextChoiceId": len(options) + 1,
            "NextAnswerId": 1,
        }
        if js:
            payload["QuestionJS"] = js
        return self.add_question(tag, payload, strip_html(question_text))

    def essay(self, tag, question_text, force=True, js=None, height=200):
        payload = {
            "QuestionText": question_text,
            "QuestionType": "TE",
            "Selector": "ESTB",
            "Configuration": {"QuestionDescriptionOption": "UseText", "InputWidth": 600, "InputHeight": height},
            "Validation": force_validation(force),
        }
        if js:
            payload["QuestionJS"] = js
        return self.add_question(tag, payload, strip_html(question_text))

    def hidden_text(self, tag, label):
        payload = {
            "QuestionText": label,
            "QuestionType": "TE",
            "Selector": "SL",
            "Configuration": {"QuestionDescriptionOption": "UseText"},
            "Validation": force_validation(False),
            "QuestionJS": read("js_hidden_field.js"),
        }
        return self.add_question(tag, payload, label)

    def expr_text(self, qid, operator, value, label=""):
        locator = f"q://{qid}/ChoiceTextEntryValue"
        return {
            "LogicType": "Question",
            "QuestionID": qid,
            "QuestionIsInLoop": "no",
            "ChoiceLocator": locator,
            "Operator": operator,
            "QuestionIDFromLocator": qid,
            "LeftOperand": locator,
            "RightOperand": value,
            "Type": "Expression",
            "Description": f"<span class=\"ConjDesc\">If</span> <span class=\"QuestionDesc\">{html.escape(label)}</span> <span class=\"OpDesc\">{html.escape(operator)}</span> <span class=\"RightOpDesc\">{html.escape(value)}</span>",
        }

    def timing(self, tag, min_seconds=0):
        payload = {
            "QuestionText": "Timing",
            "QuestionType": "Timing",
            "Selector": "PageTimer",
            "Configuration": {"QuestionDescriptionOption": "UseText", "MinSeconds": str(min_seconds), "MaxSeconds": "0"},
            "Choices": {"1": {"Display": "First Click"}, "2": {"Display": "Last Click"}, "3": {"Display": "Page Submit"}, "4": {"Display": "Click Count"}},
            "ChoiceOrder": ["1", "2", "3", "4"],
            "Validation": {"Settings": {"Type": "None"}},
        }
        return self.add_question(tag, payload, "Timing")

    def likert(self, tag, question_text, items):
        """items: list of (export_tag, statement)."""
        choices = {str(i + 1): {"Display": statement} for i, (_, statement) in enumerate(items)}
        payload = {
            "QuestionText": question_text,
            "QuestionType": "Matrix",
            "Selector": "Likert",
            "SubSelector": "SingleAnswer",
            "Configuration": {
                "QuestionDescriptionOption": "UseText",
                "TextPosition": "inline",
                "ChoiceColumnWidth": 30,
                "RepeatHeaders": "none",
                "WhiteSpace": "ON",
                "MobileFirst": True,
            },
            "Choices": choices,
            "ChoiceOrder": [str(i + 1) for i in range(len(items))],
            "Answers": {key: {"Display": value} for key, value in LIKERT.items()},
            "AnswerOrder": list(LIKERT.keys()),
            "ChoiceDataExportTags": {str(i + 1): item_tag for i, (item_tag, _) in enumerate(items)},
            "Validation": force_validation(True),
            "NextChoiceId": len(items) + 1,
            "NextAnswerId": len(LIKERT) + 1,
        }
        return self.add_question(tag, payload, strip_html(question_text))

    # ---- blocks ------------------------------------------------------------
    def block(self, name, elements, block_type="Standard"):
        """elements: list of QIDs, or the string 'PB' for a page break."""
        block_id = stable_id("BL", f"{self.name}:{name}")
        block_elements = []
        for element in elements:
            if element == "PB":
                block_elements.append({"Type": "Page Break"})
            else:
                block_elements.append({"Type": "Question", "QuestionID": element})
        self.blocks.append({
            "Type": block_type,
            "Description": name,
            "ID": block_id,
            "BlockElements": block_elements,
        })
        self.block_ids[name] = block_id
        return block_id

    # ---- flow --------------------------------------------------------------
    def flow_id(self):
        self.flow_counter += 1
        return f"FL_{self.flow_counter}"

    def flow_block(self, name):
        block_type = "Block" if self.blocks[0]["ID"] == self.block_ids[name] else "Standard"
        return {"Type": block_type, "ID": self.block_ids[name], "FlowID": self.flow_id(), "Autofill": []}

    def flow_embedded(self, fields):
        """fields: list of names (captured from URL / set later) or (name, value) tuples."""
        entries = []
        for field in fields:
            if isinstance(field, tuple):
                name, value = field
                entries.append({"Description": name, "Type": "Custom", "Field": name, "VariableType": "String", "DataVisibility": [], "AnalyzeText": False, "Value": value})
            else:
                entries.append({"Description": field, "Type": "Recipient", "Field": field, "VariableType": "String", "DataVisibility": [], "AnalyzeText": False})
        return {"Type": "EmbeddedData", "FlowID": self.flow_id(), "EmbeddedData": entries}

    def flow_branch(self, conditions, flow, description="Branch"):
        """conditions: list of expression dicts, joined with OR."""
        logic = {}
        for index, expression in enumerate(conditions):
            entry = dict(expression)
            if index > 0:
                entry["Conjuction"] = "Or"
            logic[str(index)] = entry
        logic["Type"] = "If"
        return {
            "Type": "Branch",
            "FlowID": self.flow_id(),
            "Description": description,
            "BranchLogic": {"0": logic, "Type": "BooleanExpression"},
            "Flow": flow,
        }

    def expr_choice(self, qid, choice_index, selected=True, label=""):
        locator = f"q://{qid}/SelectableChoice/{choice_index}"
        operator = "Selected" if selected else "NotSelected"
        return {
            "LogicType": "Question",
            "QuestionID": qid,
            "QuestionIsInLoop": "no",
            "ChoiceLocator": locator,
            "Operator": operator,
            "QuestionIDFromLocator": qid,
            "LeftOperand": locator,
            "Type": "Expression",
            "Description": f"<span class=\"ConjDesc\">If</span> <span class=\"QuestionDesc\">{html.escape(label)}</span> <span class=\"OpDesc\">Is {'' if selected else 'Not '}Selected</span>",
        }

    def expr_embedded(self, field, operator, value):
        return {
            "LogicType": "EmbeddedField",
            "LeftOperand": field,
            "Operator": operator,
            "RightOperand": value,
            "Type": "Expression",
            "Description": f"<span class=\"ConjDesc\">If</span> <span class=\"LeftOpDesc\">{html.escape(field)}</span> <span class=\"OpDesc\">{html.escape(operator)}</span> <span class=\"RightOpDesc\">{html.escape(value)}</span>",
        }

    def flow_end(self, redirect_url=None):
        options = {"Advanced": "true", "SurveyTermination": "DefaultMessage"}
        if redirect_url:
            options = {"Advanced": "true", "SurveyTermination": "Redirect", "EOSRedirectURL": redirect_url}
        return {"Type": "EndSurvey", "FlowID": self.flow_id(), "EndingType": "Advanced", "Options": options}

    def flow_randomizer(self, elements):
        return {"Type": "BlockRandomizer", "FlowID": self.flow_id(), "SubSet": 1, "EvenPresentation": True, "Flow": elements}

    # ---- assemble ------------------------------------------------------------
    def build(self, flow):
        def count(items):
            total = 0
            for item in items:
                total += 1
                if isinstance(item, dict) and isinstance(item.get("Flow"), list):
                    total += count(item["Flow"])
            return total

        blocks = list(self.blocks)
        blocks.append({"Type": "Trash", "Description": "Trash / Unused Questions", "ID": stable_id("BL", f"{self.name}:trash")})
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        response_set = stable_id("RS", f"{self.name}:rs")
        owner_id = stable_id("UR", f"{self.name}:owner")
        survey_options = {
            "BackButton": "false",
            "SaveAndContinue": "true",
            "SurveyProtection": "PublicSurvey",
            "BallotBoxStuffingPrevention": "false",
            "NoIndex": "Yes",
            "SecureResponseFiles": "true",
            "SurveyExpiration": "None",
            "SurveyTermination": "Redirect",
            "EOSRedirectURL": self.completion_url,
            "Header": "",
            "Footer": "",
            "ProgressBarDisplay": "None",
            "PartialData": "+1 week",
            "ValidationMessage": "",
            "PreviousButton": "",
            "NextButton": "",
            "SurveyTitle": "Workplace Interaction Study",
            "SkinLibrary": self.brand,
            "SkinType": "component",
            "Skin": {"brandingId": None, "templateId": "*simple", "overrides": None},
            "NewScoring": 1,
            "SurveyMetaDescription": "Online workplace interaction study.",
        }
        elements = [
            {"SurveyID": self.survey_id, "Element": "BL", "PrimaryAttribute": "Survey Blocks", "SecondaryAttribute": None, "TertiaryAttribute": None, "Payload": blocks},
            {"SurveyID": self.survey_id, "Element": "FL", "PrimaryAttribute": "Survey Flow", "SecondaryAttribute": None, "TertiaryAttribute": None,
             "Payload": {"Flow": flow, "Properties": {"Count": count(flow) + 1}, "FlowID": "FL_1", "Type": "Root"}},
            {"SurveyID": self.survey_id, "Element": "PL", "PrimaryAttribute": "Preview Link", "SecondaryAttribute": None, "TertiaryAttribute": None,
             "Payload": {"PreviewType": "Brand", "PreviewID": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{self.name}:preview"))}},
            {"SurveyID": self.survey_id, "Element": "PROJ", "PrimaryAttribute": "CORE", "SecondaryAttribute": None, "TertiaryAttribute": "1.1.0", "Payload": {"ProjectCategory": "CORE", "SchemaVersion": "1.1.0"}},
            {"SurveyID": self.survey_id, "Element": "QC", "PrimaryAttribute": "Survey Question Count", "SecondaryAttribute": str(len(self.questions)), "TertiaryAttribute": None, "Payload": None},
            {"SurveyID": self.survey_id, "Element": "RS", "PrimaryAttribute": response_set, "SecondaryAttribute": "Default Response Set", "TertiaryAttribute": None, "Payload": None},
            {"SurveyID": self.survey_id, "Element": "SCO", "PrimaryAttribute": "Scoring", "SecondaryAttribute": None, "TertiaryAttribute": None,
             "Payload": {"ScoringCategories": [], "ScoringCategoryGroups": [], "ScoringSummaryCategory": None, "ScoringSummaryAfterQuestions": 0, "ScoringSummaryAfterSurvey": 0, "DefaultScoringCategory": None, "AutoScoringCategory": None}},
            {"SurveyID": self.survey_id, "Element": "SO", "PrimaryAttribute": "Survey Options", "SecondaryAttribute": None, "TertiaryAttribute": None, "Payload": survey_options},
        ] + self.questions + [
            {"SurveyID": self.survey_id, "Element": "STAT", "PrimaryAttribute": "Survey Statistics", "SecondaryAttribute": None, "TertiaryAttribute": None, "Payload": {"MobileCompatible": True, "ID": "Survey Statistics"}},
        ]
        return {
            "SurveyEntry": {
                "SurveyID": self.survey_id,
                "SurveyName": self.name,
                "SurveyDescription": None,
                "SurveyOwnerID": owner_id,
                "SurveyBrandID": self.brand,
                "DivisionID": None,
                "SurveyLanguage": "EN",
                "SurveyActiveResponseSet": response_set,
                "SurveyStatus": "Inactive",
                "SurveyStartDate": "0000-00-00 00:00:00",
                "SurveyExpirationDate": "0000-00-00 00:00:00",
                "SurveyCreationDate": now,
                "CreatorID": owner_id,
                "LastModified": now,
                "LastAccessed": "0000-00-00 00:00:00",
                "LastActivated": "0000-00-00 00:00:00",
                "Deleted": None,
            },
            "SurveyElements": elements,
        }


def force_validation(force):
    if force:
        return {"Settings": {"ForceResponse": "ON", "ForceResponseType": "ON", "Type": "None"}}
    return {"Settings": {"ForceResponse": "OFF", "Type": "None"}}


def strip_html(text):
    return re.sub(r"<[^>]+>", " ", text).replace("&nbsp;", " ").strip()


def paragraphs(*items):
    return "".join(f"<p>{item}</p>" for item in items)


def bullets(items):
    return "<ul>" + "".join(f"<li>{item}</li>" for item in items) + "</ul>"


def page_header(eyebrow, title):
    return f"<p style=\"font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#667;\">{eyebrow}</p><h2 style=\"margin-top:4px;\">{title}</h2>"


def survey_js(name, service_url):
    return read(name).replace("https://YOUR-SERVICE.onrender.com", service_url)


def extra_facts_html():
    text = read("extra_facts.md")
    body = text.split("---", 1)[1] if "---" in text else text
    lines = [line.rstrip() for line in body.strip().splitlines()]
    out = []
    list_open = False
    for line in lines:
        if not line.strip():
            continue
        if line.startswith("- "):
            if not list_open:
                out.append("<ul>")
                list_open = True
            item = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", line[2:].strip())
            out.append(f"<li>{item}</li>")
            continue
        if list_open:
            out.append("</ul>")
            list_open = False
        content = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", line.strip())
        out.append(f"<p>{content}</p>")
    if list_open:
        out.append("</ul>")
    return "".join(out)


def build(args):
    s = Survey("Workplace Interaction Study (one-shot)", args.service_url, args.completion_url, args.tech_issue_url)

    # 1. Consent ---------------------------------------------------------------
    consent_text = s.text(
        "consent_text",
        paragraphs(
            "<strong>About this task</strong>",
            "This task is run by a market research company on behalf of a theme park that wants to improve its service quality.",
            "You will be asked to make suggestions to help the park. Suggestions are reviewed by the park’s management team, which decides whether to adopt them, and you will receive a reply on this platform.",
            "Are you willing to take part in this task?",
        ),
        js=survey_js("js_consent_warmup.js", s.service_url),
        description="Consent text",
    )
    consent = s.single_choice("consent", "Are you willing to take part in this task?", ["Yes, I am willing to take part", "No, I do not want to take part"])
    s.block("Consent", [consent_text, consent], block_type="Default")

    # 2. Role materials ------------------------------------------------------------
    role1 = s.text("role_1", page_header("Background 1 of 3", "The Park") + paragraphs(
        "Thanks for taking part in this task.",
        "The theme park is called Aetheria Gardens. Its entrance team’s daily work includes checking tickets at the entrance, scanning QR codes, confirming visitor categories, guiding visitors into the park, and answering simple questions from visitors.",
        "The park is run by a management team. Its operations managers are in charge of the entrance team and of how the park is staffed.",
    ), description="Background 1")
    check1 = s.single_choice("check_park", "What does the entrance team at Aetheria Gardens do every day?", [
        "Checking tickets, guiding visitors into the park and answering simple questions",
        "Operating the rides",
        "Cooking in the park restaurants",
    ])
    role2 = s.text("role_2", page_header("Background 2 of 3", "The Staffing Situation") + paragraphs(
        "Aetheria Gardens is currently facing a significant staffing challenge. Because the park relies almost exclusively on full-time, permanent employees, it is experiencing a “labor seesaw”:",
    ) + bullets([
        "Off-season: Daily attendance drops to around 500 visitors, leaving the park with a costly surplus of idle staff.",
        "Peak season: Daily attendance surges to around 5,000 visitors, leaving teams overwhelmed and shorthanded.",
    ]) + paragraphs(
        "The current labor plan was developed by park management. However, this plan is not flexible enough, and labor costs are becoming increasingly difficult to manage.",
    ), description="Background 2")
    check2 = s.single_choice("check_problem", "What is the main staffing problem at Aetheria Gardens?", [
        "Too many idle staff in off-season and too few staff in peak season",
        "The park has too few visitors in every season",
        "The QR code ticket system is broken",
    ])
    role3 = s.text("role_3", page_header("Background 3 of 3", "Your Possible Suggestion") + paragraphs(
        "You believe the theme park must adopt a more agile employment model in order to survive.",
        "For example, the park could use temporary staff and interns to manage high-volume attendance surges, or convert part of the current permanent workforce into a flexible labor pool to better align staffing levels with fluctuating demand.",
        "You are not required to propose changes to the staffing approach, but you may still suggest a change to the current arrangement in order to improve the theme park’s performance.",
        "You may propose adopting a more flexible employment model to the park manager. Please note that the current labor plan has already been agreed upon by the theme park’s management team, so proposing changes would mean raising a significant challenge to the current approach.",
        "The park’s management team is reviewing suggestions on this platform today. Your suggestion will be passed to one of the managers, who will read it and reply to you here.",
    ), description="Background 3")
    check3 = s.single_choice("check_suggestion", "What suggestion may you bring up with the manager?", [
        "A flexible labor model using options such as temporary staff, interns, or a flexible labor pool",
        "Raising ticket prices during peak season",
        "Building new rides for families",
    ])
    s.block("Background", [role1, "PB", check1, "PB", role2, "PB", check2, "PB", role3, "PB", check3])

    reread = s.text("role_reread", paragraphs(
        "<strong>Please read the information again.</strong> One of your answers did not match the materials. The three pages are repeated below.",
    ) + page_header("Background 1 of 3", "The Park") + paragraphs(
        "The theme park is called Aetheria Gardens. Its entrance team’s daily work includes checking tickets at the entrance, scanning QR codes, confirming visitor categories, guiding visitors into the park, and answering simple questions from visitors. The park is run by a management team; its operations managers are in charge of the entrance team and of how the park is staffed.",
    ) + page_header("Background 2 of 3", "The Staffing Situation") + paragraphs(
        "Aetheria Gardens relies almost exclusively on full-time, permanent employees, and is experiencing a “labor seesaw”: around 500 visitors a day in the off-season, leaving a costly surplus of idle staff, and around 5,000 visitors a day in peak season, leaving teams overwhelmed and shorthanded. The current labor plan was developed by park management, is not flexible enough, and labor costs are becoming increasingly difficult to manage.",
    ) + page_header("Background 3 of 3", "Your Possible Suggestion") + paragraphs(
        "You believe the park must adopt a more agile employment model, for example temporary staff and interns for attendance surges, or a flexible labor pool. The current labor plan has already been agreed by the management team, so proposing a change means raising a significant challenge to the current approach. The park’s management team is reviewing suggestions on this platform today; your suggestion will be passed to one of the managers, who will reply to you here.",
    ), description="Re-read materials")
    s.block("Background re-read", [reread])

    # 3. Proposal --------------------------------------------------------------
    proposal = s.essay("proposal", paragraphs(
        "<strong>Write your suggestion to the park manager.</strong>",
        "Say what you think the park should do about the staffing situation and why. Your suggestion will be passed to one of the park’s managers, who will read it and reply to you here.",
    ), force=True, js=survey_js("js_proposal_minwords.js", s.service_url), height=220)
    s.block("Proposal", [proposal])

    # 4. Waiting page --------------------------------------------------------
    waiting = s.text("waiting", "<span id=\"vr-condition\" style=\"display:none\">${e://Field/condition}</span><span id=\"vr-response-id\" style=\"display:none\">${e://Field/ResponseID}</span>" + paragraphs(
        "<strong>Your suggestion has been submitted and assigned to one of the park’s managers.</strong>",
        "Replies usually arrive within a few minutes. While you wait, here is some further information about the park.",
    ) + extra_facts_html(), js=survey_js("js_waiting_page.js", s.service_url), description="Waiting page")
    # Hidden carriers, in the order js_waiting_page.js expects (input[type=text] order on the page).
    h_status = s.hidden_text("rejection_status_q", "rejection status")
    h_msg1 = s.hidden_text("rejection_msg1_q", "rejection message 1")
    h_msg2 = s.hidden_text("rejection_msg2_q", "rejection message 2")
    h_code = s.hidden_text("rejection_code_q", "rejection compliance code")
    h_latency = s.hidden_text("rejection_latency_q", "rejection latency ms")
    h_wait = s.hidden_text("rejection_wait_q", "waiting page wait ms")
    t_wait = s.timing("t_waiting", 0)
    s.block("Waiting page", [waiting, h_status, h_msg1, h_msg2, h_code, h_latency, h_wait, t_wait])

    # 5. Manager message -----------------------------------------------------------
    card = read("manager_message_card.html")
    card = re.sub(r"<!--.*?-->", "", card, flags=re.S).strip()
    # Pipe the reply from the hidden carrier questions (always saved with the waiting page); the
    # proposal from the proposal question itself.
    card = card.replace("${e://Field/rejection_msg1}", "${q://" + h_msg1 + "/ChoiceTextEntryValue}")
    card = card.replace("${e://Field/rejection_msg2}", "${q://" + h_msg2 + "/ChoiceTextEntryValue}")
    card = card.replace("${e://Field/proposal}", "${q://" + proposal + "/ChoiceTextEntryValue}")
    message = s.text("manager_message", paragraphs("<strong>Reply from the park manager</strong>") + card + paragraphs(
        "<span style=\"color:#667;\">Click Next when you have read the reply.</span>",
    ), js=survey_js("js_manager_message.js", s.service_url), description="Manager message")
    t_message = s.timing("t_message", 20)
    s.block("Manager message", [message, t_message])

    # 6. Second materials --------------------------------------------------------
    m1 = s.text("materials_1", page_header("Materials 1 of 3", "Off-Season Situation") + paragraphs(
        "Now, please continue reading your materials. These materials describe the theme park's <strong>off-season situation</strong>.",
        "On a typical off-season weekday, the park receives <strong>around 500 visitors</strong>.",
        "The entrance is quiet for long periods, and staff members at the gate have <strong>relatively little work to do</strong>.",
    ), description="Materials 1")
    m2 = s.text("materials_2", page_header("Materials 2 of 3", "Visitor Pattern") + paragraphs(
        "Most visitors are <strong>families with young children</strong>. Families with children under 10 account for <strong>around 70% to 75%</strong> of daily visitors, while other visitor groups make up a much smaller share.",
        "Aetheria Gardens is <strong>far from the city center</strong>, and many families say the location is <strong>not very convenient</strong>.",
    ), description="Materials 2")
    m3 = s.text("materials_3", page_header("Materials 3 of 3", "Nearby Visitors") + paragraphs(
        "There are several universities and farms <strong>near the theme park</strong>, including <strong>4 universities within 10 to 18 km</strong> and <strong>around 38,000 nearby university students</strong>.",
        "Some university students say the park is cute, but it feels mainly <strong>designed for little kids</strong>. Others mention that <strong>student discounts</strong> or <strong>more photo-friendly spots</strong> might make the park more attractive to students.",
        "On the next page you can submit a further suggestion about this situation if you wish. It will go to the same manager who replied to you.",
    ), description="Materials 3")
    s.block("Second materials", [m1, "PB", m2, "PB", m3])

    # 7. Voice DV -------------------------------------------------------------
    voice = s.essay("voice_text_q", paragraphs(
        "<strong>A further suggestion (optional)</strong>",
        "You can submit a further suggestion about the situation you have just read. It will be reviewed by the same manager who replied to your first suggestion. Write it below, or leave the box empty if you have nothing to add.",
    ), force=False, js=survey_js("js_voice_timestamps.js", s.service_url), height=220)
    s.block("Second suggestion", [voice])

    # 8. Scales -----------------------------------------------------------------
    intro = s.text("survey_intro", paragraphs(
        "<strong>Post-task questions</strong>",
        "Please answer the following questions based on your experience in this study. There are no right or wrong answers. Please indicate the extent to which you agree with each statement.",
    ), description="Survey intro")
    vf = s.likert("VF", paragraphs(
        "<strong style=\"color:#c0392b;\">The following statements are about the second task, in which you could write a suggestion to the manager after reading the additional materials. Please indicate how much you agree with each statement about what you actually did.</strong>",
    ), [
        ("VF1", "I proposed more than one specific improvement to the manager in the second task."),
        ("VF2", "I made a point of raising new ideas about the visitor issue with the manager."),
        ("VF3", "Even though the manager had turned down my earlier proposal, I still put forward my views."),
        ("VF4", "I used the opportunity in the second task to share my ideas proactively."),
        ("VF5", "I brought my own ideas into the suggestion rather than only restating what the materials said."),
        ("VF6", "I offered several suggestions and ideas of my own."),
    ])
    vq = s.likert("VQ", paragraphs("<strong>Preparing your suggestion</strong>"), [
        ("VQ1", "Before writing my suggestion in the second task, I tried to back what I might suggest with the information available to me, such as the entrance records, visitor comments, or location details."),
        ("VQ2", "Before writing my suggestion in the second task, I made an effort to think through the practical concerns a manager would have, such as visitor demand, feasibility, or park operations."),
        ("VQ3", "Before writing my suggestion in the second task, I tried to anticipate the questions or doubts the manager might raise, and how I would answer them."),
        ("VQ4", "Before writing my suggestion in the second task, I made an effort to work out a clear, actionable course of action rather than a general idea."),
    ])
    reasons = s.likert("REASON", paragraphs(
        "<strong>Perceived reasons for the manager’s response</strong>",
        "Please indicate why you think the manager rejected your suggestion about the labor plan.",
        "<em>The manager rejected my suggestion because...</em>",
    ), [
        ("MR1", "The manager was influenced by their emotions."),
        ("MR2", "The manager wanted to demonstrate their authority."),
        ("MR3", "The manager personally disliked me."),
        ("PR1", "My proposal for improvement was mediocre."),
        ("PR2", "My suggestion did not really improve the current methods or practices."),
        ("PR3", "The changes I suggested for work arrangements did not really help much."),
        ("PR4", "I made impractical recommendations about how to fix work-related problems."),
        ("PR5", "My suggestion was not very useful."),
    ])
    tone = s.likert("MA", paragraphs(
        "<strong>Perceived tone of the manager’s response</strong>",
        "Please indicate how you perceived the manager’s attitude when they rejected your suggestion about the labor plan.",
        "<em>The manager’s response was...</em>",
    ), [
        ("MA1", "Polite"), ("MA2", "Courteous"), ("MA3", "Sensitive to my feelings"), ("MA4", "Respectful toward me"),
        ("MA5", "Considerate toward me"), ("MA6", "Appropriate"), ("MA7", "Civil"), ("MA8", "Tactful"),
    ])
    useful = s.likert("MC", paragraphs(
        "<strong>Perceived usefulness of the manager’s response</strong>",
        "Please indicate how you perceived the manager’s response when they rejected your suggestion about the labor plan.",
        "<em>When rejecting my suggestion, the manager...</em>",
    ), [
        ("MC1", "Pointed to specific aspects of my proposal that I could actually work on."),
        ("MC2", "Suggested that the problems with my proposal could be fixed."),
        ("MC3", "Made reference to clear, legitimate standards my proposal would have to meet."),
        ("MC4", "Was very specific and detailed."),
        ("MC5", "Made reference to specific parts of my proposal that were problematic."),
        ("MC6", "Provided clear enough guidance that I knew what to change."),
    ])
    s.block("Post-task questions", [intro, vf, "PB", vq, "PB", reasons, "PB", tone, "PB", useful])

    # 9. AI check --------------------------------------------------------------
    ai_unusual = s.essay("ai_check_unusual", paragraphs("<strong>A few final questions</strong>", "Did anything about the interaction feel unusual or unexpected? Please describe briefly."), force=True, height=120)
    ai_who = s.essay("ai_check_who", paragraphs("<strong>A few final questions</strong>", "Who do you think you were interacting with in the message exchange?"), force=True, height=120)
    ai_direct = s.single_choice("manager_ai_suspicion", paragraphs(
        "<strong>One more question</strong>",
        "In Prolific recruitment, studies may sometimes include AI participants. To help us protect data quality and reduce possible effects from AI participants, please answer the question below.",
        "Do you think the manager who replied to you may have been AI?",
    ), ["Yes", "No", "Not sure"])
    s.block("AI check", [ai_unusual, "PB", ai_who, "PB", ai_direct])

    # 10. Feedback --------------------------------------------------------------
    feedback = s.essay("task_feedback", paragraphs(
        "<strong>Task feedback</strong>",
        "If you have any suggestions about this online task, please share them with us.",
        "You may also submit without adding a suggestion. Please do not include your name or other personal information.",
    ), force=False, height=140)
    s.block("Feedback", [feedback])

    # Flow ----------------------------------------------------------------------
    flow = [
        s.flow_embedded([
            "PROLIFIC_PID", "STUDY_ID", "SESSION_ID", "condition", "proposal", "rejection_job", "rejection_status",
            "rejection_wait_ms", "rejection_msg1", "rejection_msg2", "rejection_compliance_code", "rejection_latency_ms",
            "voice_start", "voice_submit", "voice_text", "briefing_wrong",
        ]),
        s.flow_block("Consent"),
        s.flow_branch([s.expr_choice(consent, 2, True, "Consent: No")], [s.flow_end()], "No consent"),
        s.flow_randomizer([s.flow_embedded([("condition", value)]) for value in ["HP_HC", "HP_LC", "LP_HC", "LP_LC"]]),
        s.flow_block("Background"),
        s.flow_branch([
            s.expr_choice(check1, 1, False, "Park check"),
            s.expr_choice(check2, 1, False, "Problem check"),
            s.expr_choice(check3, 1, False, "Suggestion check"),
        ], [s.flow_embedded([("briefing_wrong", "1")]), s.flow_block("Background re-read")], "Briefing check wrong"),
        s.flow_block("Proposal"),
        s.flow_block("Waiting page"),
        s.flow_branch([s.expr_text(h_status, "NotEqualTo", "ok", "rejection status")], [s.flow_end(s.tech_issue_url)], "Reply failed"),
        s.flow_block("Manager message"),
        s.flow_block("Second materials"),
        s.flow_block("Second suggestion"),
        s.flow_block("Post-task questions"),
        s.flow_block("AI check"),
        s.flow_block("Feedback"),
        s.flow_end(s.completion_url),
    ]
    return s.build(flow), s


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--service-url", default="https://YOUR-SERVICE.onrender.com")
    parser.add_argument("--completion-url", default="https://app.prolific.com/submissions/complete?cc=COMPLETION_CODE")
    parser.add_argument("--tech-issue-url", default="https://app.prolific.com/submissions/complete?cc=TECHNICAL_ISSUE_CODE")
    parser.add_argument("--out", default=os.path.join(HERE, "voice_rejection_one_shot.qsf"))
    args = parser.parse_args()
    qsf, survey = build(args)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(qsf, handle, ensure_ascii=False, indent=2)
    print(f"Wrote {args.out}: {len(survey.questions)} questions, {len(survey.blocks)} blocks")


if __name__ == "__main__":
    main()
