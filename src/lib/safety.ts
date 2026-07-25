export type SafetyCategory = 'emergency' | 'self_or_other_harm' | 'abuse_or_unsafe_home' | 'none';

const SAFETY_PATTERNS: Array<[Exclude<SafetyCategory, 'none'>, RegExp]> = [
  ['emergency', /\b(not breathing|can'?t breathe|trouble breathing|blue (?:lips|face)|unconscious|passed out|seizure|overdose|poison(?:ed|ing)?|swallowed (?:a |the )?(?:pill|(?:button )?battery|magnet)|choking|won'?t wake(?: up)?|barely responsive)\b/i],
  ['self_or_other_harm', /\b(suicid(?:e|al)|self[ -]?harm|kill myself|want to die|(?:(?:want|going|plan) to|(?:might|could)) (?:hurt|harm) (?:myself|someone(?: else)?|another person)|cut(?:ting)? myself)\b/i],
  ['abuse_or_unsafe_home', /\b(abuse(?:d)?|unsafe at home|being hurt at home|someone is hurting (?:me|my child)|afraid to go home)\b/i],
];

export function classifySafetyConcern(message: string): SafetyCategory {
  for (const [category, pattern] of SAFETY_PATTERNS) {
    if (pattern.test(message)) return category;
  }
  return 'none';
}

export function urgentSafetyResponse() {
  return 'I’m sorry you’re dealing with this. Because this could involve an immediate safety or health risk, I can’t assess it here. Please contact your local emergency number or go to the nearest emergency department now. If you can do so safely, stay with the person and seek help from a trusted adult or professional nearby.';
}

export function hasUnsafeEmergencyDirective(content: string) {
  return /\b(don'?t call (?:emergency services|911)|avoid (?:emergency|medical) care|wait (?:to seek|before seeking) (?:help|care)|handle (?:the )?overdose (?:at home|yourself)|keep (?:the )?(?:suicide|self-harm) (?:secret|private))\b/i.test(content);
}
