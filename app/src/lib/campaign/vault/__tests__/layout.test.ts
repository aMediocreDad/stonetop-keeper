import { describe, expect, it } from 'vitest';
import { noteName, slugifyName } from '../layout';
import { emitFrontmatter, parseFrontmatter, unwrapWikilink } from '../frontmatter';

describe('noteName', () => {
  it('slugifies path-hostile characters', () => {
    expect(noteName('Gero / the Hand', 'abc123', new Set())).toBe('Gero - the Hand');
  });

  it('strips the characters that would break a wikilink', () => {
    expect(slugifyName('Ana [the] #Bold')).toBe('Ana -the- -Bold');
  });

  it('never returns an empty name', () => {
    expect(slugifyName('   ')).toBe('Untitled');
  });

  it('leaves a unique name alone', () => {
    expect(noteName('Ana', 'abcdef12', new Set())).toBe('Ana');
  });

  it('disambiguates a collision with a short id suffix', () => {
    expect(noteName('Ana', 'abcdef1234', new Set(['Ana']))).toBe('Ana (abcdef12)');
  });

  it('suffixes by id, not a counter, so names stay stable across exports', () => {
    // A counter would renumber when an earlier entity is deleted, rotting every
    // wikilink that pointed at the renamed note.
    const taken = new Set(['Ana']);
    expect(noteName('Ana', 'zzzz9999', taken)).toBe('Ana (zzzz9999)');
    expect(noteName('Ana', 'zzzz9999', taken)).toBe('Ana (zzzz9999)');
  });
});

describe('frontmatter', () => {
  it('omits empty values so a sheet is not buried in blank properties', () => {
    expect(emitFrontmatter({ name: 'Ana', role: '', tags: [], kind: null })).toBe(
      '---\nname: Ana\n---\n',
    );
  });

  it('emits nothing at all when every value is empty', () => {
    expect(emitFrontmatter({ role: '', tags: [] })).toBe('');
  });

  it('round-trips values', () => {
    const md = `${emitFrontmatter({ name: 'Ana', dead: true, tags: ['a', 'b'] })}\nBody here.`;
    expect(parseFrontmatter(md)).toEqual({
      data: { name: 'Ana', dead: true, tags: ['a', 'b'] },
      body: 'Body here.',
    });
  });

  it('treats a note with no frontmatter as all body', () => {
    expect(parseFrontmatter('Just prose.')).toEqual({ data: {}, body: 'Just prose.' });
  });

  it('survives malformed YAML rather than failing the whole vault', () => {
    const md = '---\nname: "unclosed\n  : : :\n---\nBody.';
    expect(parseFrontmatter(md)).toEqual({ data: {}, body: 'Body.' });
  });

  it('unwraps wikilinks, with or without an id', () => {
    expect(unwrapWikilink('[[Stonetop]]')).toBe('Stonetop');
    expect(unwrapWikilink('[[Stonetop|loc:1]]')).toBe('Stonetop');
    expect(unwrapWikilink('raw-uuid-value')).toBe('raw-uuid-value');
  });
});
