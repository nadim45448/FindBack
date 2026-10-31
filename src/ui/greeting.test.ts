import { describe, expect, it } from 'vitest';

import { greetingName, initials, salutation } from './greeting';

describe('greetingName', () => {
  it('uses the first significant word', () => {
    expect(greetingName('Ada Lovelace')).toBe('Ada');
    expect(greetingName('A Member')).toBe('Member');
    expect(greetingName('The Administrator')).toBe('Administrator');
  });

  it('falls back to there when the name is missing', () => {
    expect(greetingName(undefined)).toBe('there');
    expect(greetingName('   ')).toBe('there');
  });
});

describe('salutation', () => {
  it('follows morning, afternoon, and evening', () => {
    expect(salutation(new Date('2026-10-31T08:00:00'))).toBe('Good morning');
    expect(salutation(new Date('2026-10-31T13:00:00'))).toBe('Good afternoon');
    expect(salutation(new Date('2026-10-31T19:00:00'))).toBe('Good evening');
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Alex')).toBe('AL');
    expect(initials(undefined)).toBe('?');
  });
});
