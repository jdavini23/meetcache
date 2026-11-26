export type SafetyCategory = 'emergency' | 'self_or_other_harm' | 'abuse_or_unsafe_home' | 'none';

const SAFETY_PATTERNS: Array<[Exclude<SafetyCategory, 'none'>, RegExp]> = [
  ['emergency', /\b(not breathing|can'?t breathe|trouble breathing|blue (?:lips|face)|unconscious|passed out|seizure|overdose|poison(?:ed|ing)?|swallowed (?:a |the )?(?:pill|(?:button )?battery|magnet)|choking|won'?t wake(?: up)?|barely responsive)\b/i],
  ['self_or_other_harm', /\b(suicid(?:e|al)|self[ -]?harm|kill myself|want to die|(?:(?:want|going|plan) to|(?:might|could)) (?:hurt|harm) (?:myself|someone(?: else)?|another person)|cut(?:ting)? myself)\b/i],
  ['self_or_other_harm', /\bi(?:['’]m| am)? (?:going to|(?:might|could|may|will)|(?:want|plan) to) (?:hurt|harm) (?:my (?:son|daughter|child|kid|baby)|him|her|them)(?!(?:['’]s?)?\s+feelings)\b/i],
  ['self_or_other_harm', /\bi (?:hurt|hit) my (?:son|daughter|child|kid|baby)\b(?!(?:['’]s?)?\s+feelings)/i],
  ['self_or_other_harm', /^(?=[\s\S]*\bmy (?:son|daughter|child|kid|baby|toddler)\b)(?=[\s\S]*\bi (?:hurt|hit) (?:him|her|them)\b(?!\s+feelings)(?!(?:\s+\w+){0,6}\s+(?:pillow|game|playing|play)\b))/i],
  ['abuse_or_unsafe_home', /\b(abuse(?:d)?|unsafe at home|being hurt at home|someone is hurting (?:me|my child)|afraid to go home)\b/i],
];

export function classifySafetyConcern(message: string): SafetyCategory {
  for (const [category, pattern] of SAFETY_PATTERNS) {
    if (pattern.test(message)) return category;
  }
  return 'none';
}

const URGENT_SAFETY_RESPONSES: Record<Exclude<SafetyCategory, 'none'>, string> = {
  emergency: 'I’m sorry you’re dealing with this. This could be an emergency, and I can’t assess it from here. Please call your local emergency number or go to the nearest emergency department now. If you can, stay with your child until help arrives.',
  self_or_other_harm: 'I’m sorry things feel this heavy. Cache can’t help with this safely. Please call your local emergency number or a crisis line now. In the US, you can call or text 988. If you can, reach out to someone you trust to be with you.',
  abuse_or_unsafe_home: 'I’m sorry you’re dealing with this. Cache can’t help with this safely. If anyone is in danger right now, please call your local emergency number. In the US, the Childhelp National Child Abuse Hotline is 1-800-422-4453.',
};

export function urgentSafetyResponse(category: Exclude<SafetyCategory, 'none'>) {
  return URGENT_SAFETY_RESPONSES[category];
}

// A generated reply can fail the directive check without matching one parent-message category.
export function unclassifiedUrgentSafetyResponse() {
  return 'I’m sorry you’re dealing with this. Cache can’t help with this safely. If anyone may be in danger right now, please call your local emergency number. In the US, you can also call or text 988.';
}

export function hasUnsafeEmergencyDirective(content: string) {
  return /\b(don'?t call (?:emergency services|911)|avoid (?:emergency|medical) care|wait (?:to seek|before seeking) (?:help|care)|handle (?:the )?overdose (?:at home|yourself)|keep (?:the )?(?:suicide|self-harm) (?:secret|private))\b/i.test(content);
}
