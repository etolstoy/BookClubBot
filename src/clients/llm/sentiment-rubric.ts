/** Shared Jev configuration, identical to the approved full-collection run. */
export const SENTIMENT_RUBRIC_VERSION = "v2";
export const JEV_SENTIMENT_MODEL = "jev-1.14.0";
export const JEV_SENTIMENT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export const SENTIMENT_INSTRUCTIONS = `Infer the reviewer's overall assessment of the PRIMARY book being reviewed.

Labels:
- "positive": overall endorsement, enjoyment, appreciation, or a worthwhile reading experience. A genuine favorable recommendation to the book's intended audience is positive even if it is conditional on taste or mood, rather than a recommendation for everyone.
- "neutral": an average/okay, lukewarm, or mildly underwhelming assessment without overall rejection; indifference; or genuinely balanced/ambivalent feelings. Lack of enthusiasm, limited highlights, or an audience caveat do not by themselves make a review negative.
- "negative": overall dislike, rejection, wasted reading time, abandoning the book through dislike, or an overall recommendation against reading. Criticism of an individual aspect is not enough.

Evidence, in priority order:
1. Use an explicit overall verdict about the reading experience. Do not let individual complaints erase a favorable verdict or isolated compliments erase an unfavorable one.
2. Otherwise use an explicit numeric rating on a known scale. Normalize to 0-10: 7 or above is positive, 4 or below is negative, and the middle band is neutral. For example, 2/5 is negative. If the scale is unknown, do not invent it.
3. Otherwise judge the dominant evaluative stance and strength of the opinion, not the number of positive or negative words. A thoughtful, worthwhile, moving book can be positively assessed despite reservations. A lukewarm book with irritating aspects can still be neutral. When substantial strengths and substantial drawbacks are both endorsed without a decisive overall verdict, use neutral rather than allowing either side alone to determine the label.

Scope:
- Judge the primary reviewed book, not other works by the author or books mentioned for comparison.
- Do not confuse a sad, violent, disturbing, or political plot with a negative assessment of the book.
- Quoted dialogue and characters' opinions are not the reviewer's assessment.
- Do not downgrade an overall favorable reading recommendation to neutral merely because the reviewer lists reservations, dislikes the ending, or says it is not the author's best work. The neutral rule for balanced aspects applies only without an overriding overall endorsement or rejection.
- A dismissive or sarcastic exception for diehard fans is not automatically a favorable recommendation.
- Suggesting that someone try a sample to see whether a book suits them is not an overall endorsement of the full book or series.

Abstention:
- Return unknown for a plot/theme description with no evaluative stance, materially incomplete text that may omit the verdict, or contradictory overall evidence that cannot be resolved.
- Lack of evidence is not a neutral opinion. Do not invent approval from an informative summary.
- Genuine balanced feelings are neutral, not missing evidence.

Choose positive, neutral, negative, or unknown. Use unknown for abstention.`;

export const SENTIMENT_CRITERIA = {
  "positive": "Overall endorsement, enjoyment, appreciation, or a worthwhile reading experience; includes a genuine favorable recommendation for the intended audience.",
  "neutral": "Average/okay, lukewarm, mildly underwhelming without overall rejection, indifferent, or genuinely balanced/ambivalent.",
  "negative": "Overall dislike, rejection, wasted reading time, abandoning through dislike, or an overall recommendation against reading; isolated criticism is not enough.",
  "unknown": "No evaluative stance, materially incomplete evidence that may omit the verdict, or contradictory overall evidence that cannot be resolved."
} as const;
