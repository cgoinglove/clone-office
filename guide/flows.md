# Flows

A flow is something the clone does on its own at set times: "every weekday at 9, sum up what is
waiting for me", "every Friday at 5, list what I finished this week", "in an hour, remind me to
call Ana". It can also be how they want a kind of colleague's request handled: "when someone asks
about the payments API, end with a pointer to the #payments-api channel". They make one by telling the clone in a conversation; it shows the flow on a card
first (its name, when it runs and what it will do), and makes it only when they say so.

## When it runs

On some days at a time, every so many hours or minutes (half an hour at the least, since each
run uses their AI), or once. Times are their computer's clock. Flows run while the app is open:
a run missed because the computer slept or the app was closed is made up when the app comes
back, if it is not much later (up to two hours for a daily flow); otherwise it is noted as
missed and the flow waits for its next time.

## When a colleague asks

A flow for requests names one of the kinds of request they take (or any request). When such a
request comes in, the clone follows their instruction while it answers, and the second look
before the answer leaves takes it as their own words. What only they can give (a promise, a
decision) is still asked of them first. On the page it shows as **When a colleague asks: …**
(동료가 부탁할 때: …) with when it was last followed; it has no Run now.

## What a run does

Each run at its time starts fresh, without the conversation it was made in, and with nobody to
ask: the clone uses only what it may already use on its own (its memory, their past AI
conversations, its notes, this guide, the web, where their office work stands, and whatever they
told it "from now on" it need not ask about, such as reading in a connected service).
Their folders kept out stay out. Anything else it would have to ask about, it says it could not
do. It learns nothing from a run.

**Run now** (지금 실행) is different: they are there. The flow's conversation opens, and what the
run may not do alone yet (reading their calendar, say) is asked on a card there, as in any
conversation. With **Don't ask again for this** (앞으로 이런 건 묻지 않기) on it, the runs at its
times may do it too. So when a run says it could not do something, running it once with Run now
and allowing it fixes that.

The answer goes into the flow's own conversation, marked with ⏰ and the time; they can go on
talking there ("tell me more about the second one").

## Ready-made ones

With no flows yet, **Flows** offers two to start from: **Weekday morning catch-up** (평일 아침
브리핑: today's events when their calendar is connected, what waits for their answer in the
office, what came back from their requests, what they left open in their AI conversations since
yesterday) and **Friday wrap-up** (금요일 한 주 정리).
Either one is asked of the clone in the conversation, so they see the card and can change it
before it is made. When the clone offers something they usually do around this time, **Every
time** (매번 하기) asks it to make that a flow.

## On their page

**Flows** (플로우) lists each flow with when it runs, when it runs next and how its last run went,
and has **Run now** (지금 실행), **See the answers** (답 보기), **Pause** (멈추기) or **Resume**
(다시 켜기), and **Remove** (지우기). To change what a flow does or when, they tell the clone;
it changes the flow they have rather than making a copy, again after a card.
