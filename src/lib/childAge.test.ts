import { describe, expect, it } from 'vitest';
import { formatChildAge } from './childAge';

describe('formatChildAge', () => {
  const now = new Date(2026, 6, 22);

  it('formats ages below two years in months', () => {
    expect(formatChildAge(7, 2026, now)).toBe('0 months old');
    expect(formatChildAge(8, 2025, now)).toBe('11 months old');
  });

  it('formats ages of two years and above in years', () => {
    expect(formatChildAge(7, 2024, now)).toBe('2 years old');
    expect(formatChildAge(7, 2025, now)).toBe('12 months old');
  });

  it('does not report a negative age for a future birth month', () => {
    expect(formatChildAge(12, 2026, now)).toBe('0 months old');
  });
});
