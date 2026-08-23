import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useScrollLock } from '@/hooks/useScrollLock';

function Locker({ active }: { active: boolean }) {
  useScrollLock(active);
  return null;
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('useScrollLock', () => {
  it('freezes the page while active and restores the previous value after', () => {
    const { rerender } = render(<Locker active={false} />);
    expect(document.body.style.overflow).toBe('');

    rerender(<Locker active />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Locker active={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps the lock when a NESTED locker releases — the counter, not a boolean', () => {
    // The real shape of this: a ConfirmDialog opened from inside
    // LocationsManagerModal. Dismissing the confirm must not hand the page
    // back to the wheel while the manager is still open.
    const { rerender } = render(
      <>
        <Locker active />
        <Locker active />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <Locker active />
        <Locker active={false} />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <Locker active={false} />
        <Locker active={false} />
      </>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('restores whatever was there before, not a hardcoded empty string', () => {
    document.body.style.overflow = 'scroll';
    const { rerender } = render(<Locker active />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Locker active={false} />);
    expect(document.body.style.overflow).toBe('scroll');
  });
});
