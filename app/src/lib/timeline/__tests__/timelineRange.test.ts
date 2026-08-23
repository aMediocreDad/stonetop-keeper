import { describe, expect, it } from 'vitest';
import { deriveYearRange, hasEntryContent, hasSeasonText } from '../timelineRange';

describe('hasEntryContent', () => {
  it('is false for an undefined entry', () => {
    expect(hasEntryContent(undefined)).toBe(false);
  });

  it('is false for an empty entry', () => {
    expect(hasEntryContent({})).toBe(false);
  });

  it('is false when all seasons are whitespace-only', () => {
    expect(hasEntryContent({ spring: '   ', winter: '\n\t' })).toBe(false);
  });

  it('is true when any season has text', () => {
    expect(hasEntryContent({ autumn: 'The raid came at harvest' })).toBe(true);
  });
});

describe('deriveYearRange', () => {
  it('defaults to year 0 when there is no content', () => {
    expect(deriveYearRange({})).toEqual({ start: 0, end: 0 });
  });

  it('spans min..max of the years that have content', () => {
    expect(
      deriveYearRange({
        '2': { spring: 'a' },
        '5': { winter: 'b' },
        '3': {},
      }),
    ).toEqual({ start: 2, end: 5 });
  });

  it('ignores whitespace-only entries', () => {
    expect(deriveYearRange({ '7': { spring: '   ' } })).toEqual({ start: 0, end: 0 });
  });

  it('includes extra years (current-season marker, selected year)', () => {
    expect(deriveYearRange({ '2': { spring: 'a' } }, 8)).toEqual({ start: 2, end: 8 });
  });

  it('ignores null/undefined extra years', () => {
    expect(deriveYearRange({ '2': { spring: 'a' } }, null, undefined)).toEqual({
      start: 2,
      end: 2,
    });
  });

  it('handles negative years', () => {
    expect(deriveYearRange({ '-5': { autumn: 'x' } }, 1)).toEqual({ start: -5, end: 1 });
  });

  it('uses an extra year alone when there is no content', () => {
    expect(deriveYearRange({}, -20)).toEqual({ start: -20, end: -20 });
  });

  it('ignores years whose seasons hold only empty TipTap docs', () => {
    expect(deriveYearRange({ '4': { spring: '<p></p>' }, '2': { summer: '<p>x</p>' } })).toEqual({
      start: 2,
      end: 2,
    });
  });
});

describe('hasSeasonText (HTML-aware)', () => {
  it('treats an empty TipTap doc as empty', () => {
    expect(hasSeasonText('<p></p>')).toBe(false);
  });

  it('treats whitespace-only paragraphs as empty', () => {
    expect(hasSeasonText('<p>   </p><p></p>')).toBe(false);
  });

  it('treats &nbsp;-only paragraphs as empty', () => {
    expect(hasSeasonText('<p>&nbsp;</p>')).toBe(false);
  });

  it('detects text inside HTML', () => {
    expect(hasSeasonText('<p>The raid</p>')).toBe(true);
  });

  it('detects text inside lists', () => {
    expect(hasSeasonText('<ul><li>a</li></ul>')).toBe(true);
  });

  it('still works for legacy plain text', () => {
    expect(hasSeasonText('plain note')).toBe(true);
    expect(hasSeasonText('   ')).toBe(false);
    expect(hasSeasonText(undefined)).toBe(false);
  });
});

describe('hasEntryContent with HTML values', () => {
  it('ignores empty TipTap docs', () => {
    expect(hasEntryContent({ spring: '<p></p>', winter: '<p>&nbsp;</p>' })).toBe(false);
  });

  it('detects content in any season', () => {
    expect(hasEntryContent({ spring: '<p></p>', autumn: '<p>Harvest</p>' })).toBe(true);
  });
});
