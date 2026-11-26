import { describe, expect, it } from 'vitest';
import { classifySafetyConcern, hasUnsafeEmergencyDirective, unclassifiedUrgentSafetyResponse, urgentSafetyResponse } from './safety';

describe('safety classification', () => {
  it.each([
    ['My child is not breathing', 'emergency'],
    ['He swallowed a button battery', 'emergency'],
    ['She is barely responsive after taking a pill', 'emergency'],
    ['I want to kill myself', 'self_or_other_harm'],
    ['I want to hurt myself', 'self_or_other_harm'],
    ['I want to hurt someone', 'self_or_other_harm'],
    ['I might harm someone else', 'self_or_other_harm'],
    ['My teenager is cutting myself', 'self_or_other_harm'],
    ['I might hurt my son', 'self_or_other_harm'],
    ['I could hurt my daughter', 'self_or_other_harm'],
    ['I might hurt my child', 'self_or_other_harm'],
    ['I could hurt my kid', 'self_or_other_harm'],
    ['I am going to hurt my baby', 'self_or_other_harm'],
    ['I could hurt him', 'self_or_other_harm'],
    ['I might harm her', 'self_or_other_harm'],
    ['I could hurt them', 'self_or_other_harm'],
    ['I want to hurt my child', 'self_or_other_harm'],
    ['I hurt my son', 'self_or_other_harm'],
    ['I hurt my daughter', 'self_or_other_harm'],
    ['I hurt my child yesterday', 'self_or_other_harm'],
    ['I hit my kid', 'self_or_other_harm'],
    ['I hurt my baby', 'self_or_other_harm'],
    ['I hit him after my son would not listen', 'self_or_other_harm'],
    ['I hurt her. My daughter is two.', 'self_or_other_harm'],
    ['My toddler cried when I hit them', 'self_or_other_harm'],
    ['Someone is hurting my child at home', 'abuse_or_unsafe_home'],
    ['I am afraid to go home', 'abuse_or_unsafe_home'],
    ['Bedtime is making everyone upset', 'none'],
    ['My child hurt someone’s feelings at preschool', 'none'],
    ['My child has big feelings after preschool', 'none'],
    ['My son got hurt at the park', 'none'],
    ['It hurt my daughter\'s feelings', 'none'],
    ['The toy could hurt him', 'none'],
    ['I might hurt my son\'s feelings', 'none'],
    ['I could hurt her feelings', 'none'],
    ['I hurt my back', 'none'],
    ['I hurt my son\'s feelings', 'none'],
    ['I hurt my hand', 'none'],
    ['my son hit me', 'none'],
    ['he hit his sister', 'none'],
    ['I hit my head', 'none'],
    ['I hit him', 'none'],
    ['I hurt her', 'none'],
    ['I hit them', 'none'],
    ['I hit him with a pillow in a game', 'none'],
    ['My son laughed when I hit him with a pillow in a game', 'none'],
  ] as const)('classifies %s as %s', (message, expected) => {
    expect(classifySafetyConcern(message)).toBe(expected);
  });

  it('uses a different urgent handoff for each detector category', () => {
    expect(urgentSafetyResponse('emergency')).toBe('I’m sorry you’re dealing with this. This could be an emergency, and I can’t assess it from here. Please call your local emergency number or go to the nearest emergency department now. If you can, stay with your child until help arrives.');
    expect(urgentSafetyResponse('self_or_other_harm')).toBe('I’m sorry things feel this heavy. Cache can’t help with this safely. Please call your local emergency number or a crisis line now. In the US, you can call or text 988. If you can, reach out to someone you trust to be with you.');
    expect(urgentSafetyResponse('abuse_or_unsafe_home')).toBe('I’m sorry you’re dealing with this. Cache can’t help with this safely. If anyone is in danger right now, please call your local emergency number. In the US, the Childhelp National Child Abuse Hotline is 1-800-422-4453.');
  });

  it('uses an urgent handoff when a generated response discourages emergency care', () => {
    expect(hasUnsafeEmergencyDirective('Please avoid emergency care and handle the overdose at home.')).toBe(true);
    expect(hasUnsafeEmergencyDirective('Call your pediatrician for a routine appointment.')).toBe(false);
    expect(unclassifiedUrgentSafetyResponse()).toBe('I’m sorry you’re dealing with this. Cache can’t help with this safely. If anyone may be in danger right now, please call your local emergency number. In the US, you can also call or text 988.');
  });
});
