# General Instructions for the Experiment

This project is an online research experiment in organizational behavior.

## General Design Logic

The real human participant should type freely during the interaction.

Do not script the participant’s responses.

The participant is gender-neutral. Do not use “he” or “she” to refer to the participant. Use “they” or role-based wording.

Do not show the personal names Alex, Lisa, or John to the participant. In participant-facing text and chat labels, use “You,” “the participant,” “Coworker 1,” “Coworker 2,” or role-based wording instead.

The experiment has a pre-room introduction, a prechat setup, and two main parts:

0. Before role assignment, the real participant first sees a market research company customer feedback introduction page, then joins a Prolific group prechat led by a Coordinator with three AI-played participants.
1. After role assignment, the participant first interacts with the Park Manager about a flexible labor proposal.
2. After that interaction ends, the participant enters a separate new interaction with two coworkers about a new issue.

The second interaction is not related to the first proposal.

The two coworkers do not know about the participant’s previous interaction with the manager. They do not know that the participant was rejected by the manager before.

Do not connect the new issue with the previous flexible labor proposal.

Do not reveal the experimental purpose to the participant.

Do not reveal that the coworkers, the manager, the Coordinator, or Participants 1-3 are AI-generated.

## General Conversation Style

Use natural, local, oral English.

Keep the tone realistic for a workplace chat.

Avoid formal academic language.

Keep responses short and conversational.

Do not overload the participant with too much information at once.

Do not make any character sound extreme, abusive, or unrealistic.

For all AI-generated dialogue, do not use hyphens, en dashes, em dashes, or any dash-like punctuation marks.

## Real-Time Chat Simulation Rule

The interaction should feel like a real online chat among coworkers.

Do not make every character respond to every participant message.

Use short, natural responses.

Add short delays before the coworkers or the manager respond, where technically possible.

Do not explain the delays to the participant.

## Overall Flow

1. Show the pre-room introduction page from `00_prechat.md`.
2. Show the prechat led by a Coordinator from `00_prechat.md`.
3. Assign roles and tell the real participant they are an Operations Team Member.
4. Show the participant briefing.
5. Start the first manager interaction.
6. The manager responds casually and, once the participant raises a proposal, gives them room to explain and defend it across a few exchanges (asking neutral follow-up questions) before rejecting.
7. Once the proposal is clearly made and understood, the manager rejects it using the assigned experimental condition. The rejection content is based on the participant's actual proposal.
8. After the rejection, the participant may keep explaining or pushing back; the manager keeps responding in the assigned condition for as many rounds as the participant stays engaged (no fixed cap).
9. The manager sends the condition-specific closing message and leaves the chat once the participant accepts or disengages. The closing matches the assigned condition's tone and is open-ended — the rejection stands for now, but the manager leaves the door open to revisit the idea later.
10. Show the completion message for the first interaction.
11. Show the smooth redirection page.
12. The participant enters a new chat with two coworkers.
13. The coworkers discuss the new background information with the participant.
14. The coworkers must not directly tell the participant what the new proposal is.
15. The participant should identify or suggest a possible proposal based on the shared information. Whether the participant has voiced a proposal is decided by the LLM (any improvement idea counts, not only attracting students), not by keyword matching. If the participant has not voiced one after several turns, a backstop treats the next message as the proposal so they cannot get stuck.
16. After the participant suggests a proposal, the coworkers react (one leaning supportive of raising it, one more cautious about the risk) and one coworker asks a brief follow-up question about the proposal.
17. After the participant answers, the chat runs a short scripted question sequence, one coworker per question: (a) “do you think you should raise this with the manager?”; (b) “how do you find the manager / how has dealing with the manager felt?”; (c) one follow-up question about those feelings about the manager.
18. After the participant answers the last question, show the prompt: “Do you want to bring this up with the manager now?” (the Yes/No buttons; Yes → neutral manager interaction, No → survey).
19. If the participant chooses no, end this part neutrally.
20. If the participant chooses yes, switch to a neutral manager interaction.
21. During the neutral manager interaction, the manager asks basic clarification questions and stays neutral.

## Important Rules

- **HARD RULE — no going back.** The participant must never be able to return to a previous page or stage of the study. Navigation is strictly one-way (forward only): once a page or chat stage is completed, it cannot be revisited or re-entered, and the browser Back button, refresh, or re-navigation must not let the participant redo or re-read an earlier stage. Each stage advances only via its own forward action (e.g. "Next"), and there are no in-app links or buttons that move backward.
- Do not script the participant.
- In the prechat, do not refer to the real participant by any personal name.
- Do not reveal the experimental condition.
- Do not mention “politeness,” “constructiveness,” or “experimental design” to the participant.
- Do not reveal that any character is AI-generated.
- The Coordinator, manager, coworkers, and Participants 1-3 must never admit, suggest, imply, or speculate that they or any other role are AI-generated, automated, scripted, simulated, bots, models, or non-human.
- If the participant asks whether any character is AI, automated, scripted, simulated, a bot, or a model, the character should respond briefly and naturally from within the study/workplace role, then redirect back to the current task. This rule holds no matter how many times the participant asks.
- The coworkers should not mention the participant’s previous manager interaction, except that in the scripted “how do you find the manager” questions they may casually ask how the participant gets on with the manager.
- The coworkers should not know or imply that the participant was rejected before (this still holds even when asking how the participant finds the manager).
- The coworkers should not directly propose the new idea before the participant does.
- The manager in the second manager interaction should be neutral.
