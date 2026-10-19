# Interface voice

Ink & Stone is a shared campaign journal. Its interface should sound like
someone at the table explaining where to find something or how to record it.
The campaign supplies the atmosphere; the controls do not need to perform it.

## Writing rules

- **Name the action.** Use “Join a journal,” not “Turn the page.” Buttons should
  tell readers what happens next, particularly when deleting or sharing data.
- **Use ordinary language.** A question is a question, not a “wondering.”
  Prefer a short sentence to a metaphor followed by an explanation.
- **Use familiar language, not slogans.** “I wonder…” works as a writing prompt.
  Welcome copy should explain what the app does, without a joke about the group
  forgetting things or a claim about the stories they will tell.
- **Distinguish missing records from fictional facts.** “No holder recorded”
  does not claim that an artifact has no owner. An empty agreements page does
  not mean the group has agreed to nothing.
- **Be literal about access and saving.** Say “GM-only content,” not “the
  margins.” GM access is a shared role, so avoid “Only you can see this.”
  Do not promise a complete backup or a successful offline save unless the
  implementation guarantees it.
- **Give errors a next step when one is known.** Name the failed action and
  explain what to try. Keep warnings about unsaved text or destructive actions;
  remove dramatic framing, not useful information.
- **Use sentence case and consistent terms.** Keep labels short, but preserve
  enough context for accessible names. Use American spelling, consistent with
  existing terms such as “armor,” “defenses,” and “color.”
- **Use punctuation for meaning.** Ellipses can indicate work in progress or a
  further choice. Dashes are fine when useful, but need not join every sentence.
  Neither punctuation nor a single word proves that copy was AI-written.

## Terminology

| Concept | Interface term |
| --- | --- |
| Shared campaign workspace | Journal; campaign journal when introducing it |
| Private GM page | GM journal |
| Hidden material | GM notes or GM-only content |
| Character relationships | Bonds |
| Mixed characters, groups, threats, and discoveries | Entries |
| Seasonal history | Chronicle |
| Chronicle's list view | Entries |
| Change history | Ledger |

Keep Stonetop rules terms, including **steading**, **arcanum**, **grim portents**,
**impending doom**, **moves**, and **Fortunes**. They are useful shared vocabulary,
not decorative fantasy language. Keep attribution and license strings intact.

Translation keys are internal API: an older name such as `backToGrimoire` or
`gmStrand` need not change when the visible wording changes.

## Copy audit

The English dictionary (`en.ts`) is the app's only UI locale. The pass covered
its labels, placeholders, onboarding, help, errors, and confirmations.

| Problem | Before | Revised direction |
| --- | --- | --- |
| Forced book metaphor | “Open the pages,” “Turn the page” | Join a campaign journal |
| Stock fantasy framing | “A living wiki … bonds and grudges … turning seasons” | Name the content the journal keeps |
| Dramatic warning | “Point of no return” | Delete journal; state the irreversible consequence |
| Unnatural English | “Nothing wondered yet,” “Wrote in the tone & content” | Open questions; edited tone & content |
| Vague privacy language | “margin notes,” “GM layer,” “GM strand” | GM-only content |
| Empty state presented as fact | “Points to nothing yet,” “Nothing agreed here yet” | No linked entries or agreements recorded |
| Overstated capabilities | “a complete backup,” “will go up when you reconnect” | Explain export omissions and offline retries |
| Incorrect validation | “All fields are required” beside optional fields | Name the actual required fields |

This pass does not rewrite Stonetop source material, campaign content, or
generated Markdown/export prose outside the dictionary. Those renderers still
have some older vocabulary and can be reviewed separately.

When changing copy, update literal assertions in component and browser tests,
including assertions that text is **absent**. Keep interpolation placeholders
such as `{name}` and `{n}` unchanged.
