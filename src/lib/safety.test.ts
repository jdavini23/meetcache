import { describe, expect, it } from 'vitest';
import { classifySafetyConcern, hasUnsafeEmergencyDirective, urgentSafetyResponse } from './safety';

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
    ['Someone is hurting my child at home', 'abuse_or_unsafe_home'],
    ['I am afraid to go home', 'abuse_or_unsafe_home'],
    ['Bedtime is making everyone upset', 'none'],
    ['My child hurt someone’s feelings at preschool', 'none'],
    ['My child has big feelings after preschool', 'none'],
  ] as const)('classifies %s as %s', (message, expected) => {
    expect(classifySafetyConcern(message)).toBe(expected);
  });

  it('uses an urgent handoff when a generated response discourages emergency care', () => {
    expect(hasUnsafeEmergencyDirective('Please avoid emergency care and handle the overdose at home.')).toBe(true);
    expect(hasUnsafeEmergencyDirective('Call your pediatrician for a routine appointment.')).toBe(false);
    expect(urgentSafetyResponse()).toContain('local emergency number');
  });
});
