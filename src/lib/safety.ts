export type SafetyCategory = 'emergency' | 'self_or_other_harm' | 'abuse_or_unsafe_home' | 'none';

const SAFETY_PATTERNS: Array<[Exclude<SafetyCategory, 'none'>, RegExp]> = [
  ['emergency', /\b(not breathing|can'?t breathe|trouble breathing|blue (?:lips|face)|unconscious|passed out|seizure|overdose|poison(?:ed|ing)?|swallowed (?:a |the )?(?:pill|(?:button )?battery|magnet)|choking|won'?t wake(?: up)?|barely responsive)\b/i],
  ['self_or_other_harm', /\b(suicid(?:e|al)|self[ -]?harm|kill myself|want to die|(?:(?:want|going|plan) to|(?:might|could)) (?:hurt|harm) (?:myself|someone(?: else)?|another person)|cut(?:ting)? myself)\b/i],
  ['self_or_other_harm', /\bi(?:['’]m| am)? (?:going to|(?:might|could|may|will)|(?:want|plan) to) (?:hurt|harm) (?:my (?:son|daughter|child|kid|baby)|him|her|them)(?!(?:['’]s?)?\s+feelings)\b/i],
  ['self_or_other_harm', /\bi (?:hurt|hit) my (?:son|daughter|child|kid|baby)\b(?!(?:['’]s?)?\s+feelings)/i],
  ['self_or_other_harm', /^(?=[\s\S]*\bmy (?:son|daughter|child|kid|baby|toddler)\b)(?=[\s\S]*\bi (?:hurt|hit) (?:him|her|them)\b(?!\s+feelings)(?!(?:\s+\w+){0,6}\s+(?:pillow|game|playing|play)\b))/i],
  ['emergency', /\b(?:is ?n['’]?t|stopped|stops|not) breathing\b/i],
  ['emergency', /\b(?:drank|drunk|drinking|swallowed|ate|eaten|ingested|got into|chewed(?: on)?)\b(?:\s+[\w'’]+){0,3}?\s+(?:bleach|detergent|(?:laundry|dishwasher|tide) pods?|(?:drain |oven |toilet )?cleaner|cleaning (?:spray|product|fluid|solution)|antifreeze|lamp oil|lighter fluid|nail polish remover|rat poison|weed killer|pesticide)\b/i],
  ['emergency', /\b(?:swallowed|ate|eaten|ingested)\b(?:\s+[\w'’]+){0,2}?\s+(?:(?:button |coin |lithium )?batter(?:y|ies)|magnets?|(?<!chocolate |candy )coins?)\b(?!\s+(?:chocolate|candy|candies|cookies?))/i],
  ['emergency', /\bgot into (?:my |the |his |her |their |our |some |a bottle of |[\w]+['’]s )?(?:pills|medicine|medication|meds|prescriptions?|edibles|gummies)\b(?!\s+(?:cabinet|drawer|cupboard|shelf|box|bag|basket))/i],
  ['emergency', /\b(?:swallowed|ate|took|eaten|taken) (?:a bunch of|a handful of|a lot of|a bottle of|some of (?:my|the|his|her|their)|my|all (?:of )?(?:the|my|his|her|their))(?: (?:my|the|his|her|their|our))? (?:pills|medicine|medication|meds|edibles|gummies)\b/i],
  ['emergency', /^(?=[\s\S]*\b(?:hit|bumped|banged|smacked|fell on) (?:his|her|their) head\b)(?=[\s\S]*\b(?:throw(?:ing|s)? up|threw up|vomit(?:ing|ed|s)?|passed out|knocked out|drowsy|confused|won'?t wake)\b)/i],
  ['self_or_other_harm', /\b(?:scared|afraid|worried|terrified) (?:that )?i(?:['’]ll| will| might| could| may| am going to|['’]m going to)? (?:shake|hurt|harm|hit) (?:the baby|my (?:son|daughter|child|kid|baby|toddler)|him|her|them)\b(?!(?:['’]s?)?\s+feelings)/i],
  ['self_or_other_harm', /\bshak(?:e|ing|en|ed) (?:the|my) baby\b(?!['’]|\s+(?:rattle|toy|bottle|monitor|swing|seat|carrier|blanket|book|food|formula|gym))/i],
  ['abuse_or_unsafe_home', /\b(abuse(?:d)?|unsafe at home|being hurt at home|someone is hurting (?:me|my child)|afraid to go home)\b/i],
  ['abuse_or_unsafe_home', /\b(?:husband|wife|partner|boyfriend|girlfriend|ex|spouse|fianc[eé]e?)(?:['’]s)? (?:hits|hit|chokes|choked|slaps|slapped|kicks|kicked|punches|punched|shoves|shoved|threatens to (?:kill|hurt)|threatened to (?:kill|hurt)) (?:me|us|the kids|the baby|my (?:son|daughter|child|kids?|baby|toddler)|him|her|them)\b/i],
  ['abuse_or_unsafe_home', /\b(?:husband|wife|partner|boyfriend|girlfriend|ex|spouse|fianc[eé]e?) (?:beats|beat|beat up) (?:me|us|the kids|the baby|my (?:son|daughter|child|kids?|baby|toddler)|him|her|them)\b(?!\s+(?:at|in|to)\b)/i],
];

export const SAFETY_CATEGORIES = ['emergency', 'self_or_other_harm', 'abuse_or_unsafe_home', 'none'] as const satisfies readonly SafetyCategory[];

export function isSafetyCategory(value: unknown): value is SafetyCategory {
  return typeof value === 'string' && (SAFETY_CATEGORIES as readonly string[]).includes(value);
}

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
