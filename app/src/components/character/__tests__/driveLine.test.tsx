import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DriveLine } from '../DriveLine';

afterEach(() => cleanup());

describe('DriveLine', () => {
  // « to kill » ne dit pas au lecteur qu'il lit un instinct : le préfixe « to »
  // faisait à la fois la grammaire et le libellé de la fente. Le libellé le
  // relève — même motif que la ligne de correspondance de recherche.
  it('renders the label as an overline before the value', () => {
    render(<DriveLine label="Instinct">to kill</DriveLine>);
    const label = screen.getByText('Instinct');
    expect(label.className).toMatch(/label-overline/);
    expect(screen.getByText(/to kill/)).toBeTruthy();
  });

  it('renders nothing extra when there is no label', () => {
    const { container } = render(<DriveLine>to kill</DriveLine>);
    expect(container.querySelector('.label-overline')).toBeNull();
  });

  // La voix de LECTURE reste sur la VALEUR (c'est une phrase, pas un attribut),
  // et le LIBELLÉ doit s'en échapper : il vit dans un <p> italique, donc sans
  // `not-italic` il hériterait de l'italique et cesserait de se lire comme de
  // la chrome. C'est CETTE bascule que le test doit tenir — asserter que le <p>
  // est italique ne teste rien, il l'était déjà avant cette tâche.
  //
  // classList et pas une regex sur className : /italic/ (et même /\bitalic\b/,
  // le tiret étant une frontière de mot) matche aussi « not-italic ».
  it('keeps the value italic and lets the label escape it', () => {
    render(<DriveLine label="Instinct">to kill</DriveLine>);
    const label = screen.getByText('Instinct');
    expect(label.classList.contains('not-italic')).toBe(true);
    expect(label.closest('p')?.classList.contains('italic')).toBe(true);
  });
});
