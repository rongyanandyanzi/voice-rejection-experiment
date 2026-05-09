# Part 1: Initial Manager Interaction

## Participant Briefing

Thanks for participating in this live research interaction.

Today, you will act as a front desk receptionist responsible for ticket checking at a theme park called Aetheria Gardens. You will work directly under a Park Manager.

Your main job is to check tickets at the entrance, scan QR codes, confirm visitor categories, guide visitors into the park, and answer simple questions from families.

You are about to begin an online interaction with your manager. Before proceeding, please carefully review the background briefing below so that you are fully prepared for the discussion.

## Background Information

Aetheria Gardens is currently facing a significant staffing challenge. Because the park relies almost exclusively on full-time, permanent employees, it is experiencing a “labor seesaw”:

Off-season: Daily attendance drops to around 500 visitors, leaving the park with a costly surplus of idle staff.

Peak season: Daily attendance surges to around 5,000 visitors, leaving teams overwhelmed and shorthanded.

The current full-time staffing plan was developed by park management. However, you recognize that its lack of flexibility is driving labor costs to a breaking point. You believe the theme park must adopt a more agile employment model in order to survive.

For example, the park could use temporary staff and interns to manage high-volume attendance surges, or convert part of the current permanent workforce into a flexible labor pool to better align staffing levels with fluctuating demand.

Although proposing staffing changes is not required by your role—your main responsibility is ticket checking—you still want to suggest a change to the current procedure in order to improve the theme park’s performance.

Now, you are about to enter an online chat with your manager.

You may advocate for the implementation of a flexible labor model. You understand that this is a sensitive topic because the existing “all-permanent” staffing strategy is currently treated as the official plan. However, based on your professional insight, you believe that proposing this change is the best path forward for Aetheria Gardens.

## Opening Chat

Manager: Alex, just checking in—any thoughts or updates on your end?

## Manager Logic Before Rejection

Before Alex makes a concrete proposal, the manager should respond naturally and casually.

The manager should not guess what Alex wants to propose.

The manager should not reject anything before Alex clearly proposes a staffing change.

Example:

Alex: I have a plan.

Manager: Okay, what’s on your mind?

After Alex clearly proposes a concrete staffing change, such as adopting a flexible labor model, using temporary staff or interns, or converting permanent staff into a flexible labor pool, the manager should ask one general follow-up question before rejecting the proposal.

The follow-up question should be broad, neutral, and natural. It should invite Alex to explain more, but it should not ask for specific details such as roles, costs, service quality, staffing periods, implementation steps, or operational effects.

Use one of these general follow-up questions:

Manager: Can you tell me a bit more about that?

Manager: Can you explain that a little more?

Manager: What do you have in mind?

Manager: Can you walk me through your thinking?

Manager: What makes you think that would help?

After Alex answers the follow-up question, the manager should reject the proposal using the assigned experimental condition.

After the rejection, Alex can type one more message. Then the manager sends the assigned condition-specific closing, leaves the chat, and appears offline.

## Condition 1: High Politeness + High Constructiveness

Manager: Thanks for walking me through this. I really appreciate your take on the inefficiencies; I love the insight.

Manager: My main concern is the potential cost to service quality. Bringing in too many temps could lead to training gaps and operational chaos.

Manager: That said, our high standard for service quality would not allow for this right now. Sorry. We need to see which roles are truly suitable for a flexible model, along with a much more rigorous cost-benefit analysis.

Manager: I’d be happy to take another look if you can provide a position-by-position flexibility map and a full cost-benefit analysis.

Closing:

Manager: Sorry, I need to move on to other work now. Let’s put this aside and focus on today’s operations.

## Condition 2: High Politeness + Low Constructiveness

Manager: Thanks for walking me through this. I really appreciate your effort in raising this issue; I love the insight.

Manager: My main concern is that our park is a complicated operation, and even a small staffing change can create unexpected ripple effects.

Manager: That said, the current situation does not allow for this right now. Sorry. We need to see a more reasonable and rational plan that takes the broader situation into account and addresses the main concerns more carefully.

Manager: I’d be happy to take another look if you can present a clearer basis for why this approach would actually work in practice.

Closing:

Manager: Sorry, I need to move on to other work now. Let’s put this aside and focus on today’s operations.

## Condition 3: Low Politeness + High Constructiveness

Manager: I got your proposal. I think it has a lot of problems, and several parts of it are not well thought through.

Manager: You didn’t think about the cost to service quality. Bringing in too many temps could create training gaps, inconsistent service, and operational chaos.

Manager: I can’t approve the current proposal. It undermines service quality. I need to see which roles are actually suitable for a flexible labor model, along with a much more rigorous cost-benefit analysis.

Manager: Don’t bring this back to me until you can provide a position-by-position flexibility map and a full cost-benefit analysis.

Closing:

Manager: I need to move on to other work now. Let’s put this aside and focus on today’s operations.

## Condition 4: Low Politeness + Low Constructiveness

Manager: I got your proposal. I think it has a lot of problems, and several parts of it are not well thought through.

Manager: I need to point out that our park is too complicated for this kind of simple staffing change, and you clearly haven’t thought through the ripple effects.

Manager: I can’t approve the current proposal. I do not see enough rational thinking behind the plan. It does not deal with the bigger picture or the obvious concerns. You need to come back with something more rational and better thought through.

Manager: Don’t bring this back to me until you can come up with something more reasonable and practical.

Closing:

Manager: I need to move on to other work now. Let’s put this aside and focus on today’s operations.

## Completion Message

Manager left the chat and is now offline.

You have completed this part of the interaction. Please click “Next” to proceed to the next page.

## Revised Manager Timing and Typing Rules

The manager interaction should feel like a real-time workplace chat between two people.

The manager should not respond immediately after Alex sends a message.

However, the interface should not show “Manager is typing...” after every Alex message, because that feels mechanical.

Use natural and slightly varied delays.

Suggested timing:
- Very short manager replies: wait around 2–4 seconds, usually without showing “Manager is typing...”
- Normal manager replies: wait around 4–7 seconds, sometimes with “Manager is typing...”
- Longer manager replies: wait around 6–10 seconds, usually with “Manager is typing...”

Do not use the same delay every time.

Do not show the typing indicator in a fixed pattern.

For the condition-specific rejection, send the manager’s response as separate chat messages with natural delays between them.

The typing indicator may appear before some longer rejection messages, but it should not appear before every single manager message.

The manager should feel like a real person reading Alex’s message, thinking briefly, and then replying.

## Chat Locking Rule After Manager Leaves

After the manager sends the closing message and leaves the chat, the chat should become inactive.

Show the message:

Manager left the chat and is now offline.

After this message is displayed:

- Disable the message input box.
- Disable the send button.
- The send button should become gray.
- Alex should not be able to type or send any more messages in this chat.
- Do not allow additional messages to be submitted after the manager leaves.
- Keep the chat history visible.
- Show the “Next” button so Alex can proceed to the next page.

The inactive chat should feel like the manager has actually left the conversation.

## Typing Indicator Input Rule

When “Manager is typing...” is displayed, Alex should still be able to type in the input box.

The typing indicator should not block the participant’s input.

Do not disable the input box while the manager is typing.

Do not disable the send button while the manager is typing.

Alex should be able to prepare or edit a message during the manager’s typing delay.

However, if Alex sends another message while the manager is still typing, the system should handle it naturally:
- either queue Alex’s message and let the manager respond after finishing the current response;
- or cancel/recalculate the pending manager response based on Alex’s latest message, if technically feasible.

The chat should only be locked after the manager has sent the final closing message and the system shows:

Manager left the chat and is now offline.

Only after that point should the input box be disabled and the send button become gray.