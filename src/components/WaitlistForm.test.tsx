import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WaitlistForm, { readUtmParams, sanitizeReferrer } from './WaitlistForm';

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn();
  return { insert, from: vi.fn(() => ({ insert })) };
});

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('../lib/supabase', () => ({ supabase: { from } }));
vi.mock('@sentry/react', () => ({ captureException }));

describe('WaitlistForm', () => {
  beforeEach(() => {
    insert.mockReset();
    from.mockClear();
    captureException.mockClear();
    window.history.replaceState(null, '', '/');
  });

  it('shows an inline error for an invalid email address', async () => {
    const user = userEvent.setup();
    render(<WaitlistForm idPrefix="test" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'not-an-email');
    fireEvent.submit(screen.getByPlaceholderText('your@email.com').closest('form')!);

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(insert).not.toHaveBeenCalled();
  });

  it('normalizes an email address and shows the survey after a successful signup', async () => {
    const user = userEvent.setup();
    insert.mockResolvedValue({ error: null });
    render(<WaitlistForm idPrefix="test" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'Parent@Example.com');
    await user.click(screen.getByRole('button', { name: /get early access/i }));

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ email: 'parent@example.com', source: 'test' }));
    expect(await screen.findByText(/what would you want cache's help with first/i)).toBeInTheDocument();
  });

  it('explains when the email address already exists', async () => {
    const user = userEvent.setup();
    insert.mockResolvedValue({ error: { code: '23505' } });
    render(<WaitlistForm idPrefix="test" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: /get early access/i }));

    expect(await screen.findByText('We have you down.')).toBeInTheDocument();
  });

  it('renders configurable conversion copy in the dark theme', () => {
    render(
      <WaitlistForm
        idPrefix="custom"
        isDarkTheme
        heading="Your invitation"
        buttonLabel="Request an invite"
        supportingCopy="We will email you when a spot opens."
      />
    );

    expect(screen.getByLabelText('Your invitation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request an invite/i })).toBeInTheDocument();
    expect(screen.getByText('We will email you when a spot opens.')).toBeInTheDocument();
  });

  it('shows a submission error returned by the waitlist service', async () => {
    const user = userEvent.setup();
    insert.mockResolvedValue({ error: { code: '500' } });
    render(<WaitlistForm idPrefix="test" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: /get early access/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ event: 'waitlist_insert_failed', code: '500' }) })
    );
  });

  it('does not report duplicate signups to Sentry', async () => {
    const user = userEvent.setup();
    insert.mockResolvedValue({ error: { code: '23505' } });
    render(<WaitlistForm idPrefix="test" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: /get early access/i }));

    expect(await screen.findByText('We have you down.')).toBeInTheDocument();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('records campaign tags from the landing URL', async () => {
    const user = userEvent.setup();
    insert.mockResolvedValue({ error: null });
    window.history.replaceState(null, '', '/?utm_source=threads&utm_medium=social&utm_campaign=carousel-1&fbclid=abc');
    render(<WaitlistForm idPrefix="hero" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: /get early access/i }));

    expect(insert).toHaveBeenCalledWith({
      email: 'parent@example.com',
      source: 'hero',
      referrer: null,
      utm_source: 'threads',
      utm_medium: 'social',
      utm_campaign: 'carousel-1'
    });
  });

  it('silently skips saving when the hidden honeypot field is filled', async () => {
    const user = userEvent.setup();
    const { container } = render(<WaitlistForm idPrefix="test" />);

    fireEvent.change(container.querySelector('input[name="company"]')!, { target: { value: 'Spam Inc' } });
    await user.type(screen.getByPlaceholderText('your@email.com'), 'bot@example.com');
    await user.click(screen.getByRole('button', { name: /get early access/i }));

    expect(await screen.findByText('Thanks, that helps.')).toBeInTheDocument();
    expect(insert).not.toHaveBeenCalled();
  });

  it('disables the form and shows a saving state while submitting', async () => {
    const user = userEvent.setup();
    let resolveInsert: (value: { error: null }) => void = () => undefined;
    insert.mockReturnValue(new Promise((resolve) => {
      resolveInsert = resolve;
    }));
    render(<WaitlistForm idPrefix="test" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: /get early access/i }));

    expect(screen.getByRole('button', { name: /saving your spot/i })).toBeDisabled();
    resolveInsert({ error: null });
    expect(await screen.findByText(/what would you want cache's help with first/i)).toBeInTheDocument();
  });

  it('allows the optional use-case question to be skipped', async () => {
    const user = userEvent.setup();
    insert.mockResolvedValue({ error: null });
    render(<WaitlistForm idPrefix="test" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: /get early access/i }));
    await user.click(await screen.findByRole('button', { name: /skip question/i }));

    expect(await screen.findByText('Thanks, that helps.')).toBeInTheDocument();
  });
});

describe('waitlist attribution helpers', () => {
  it('keeps only known campaign tags and trims long values', () => {
    expect(readUtmParams(`?utm_source=x&gclid=1&utm_campaign=${'a'.repeat(150)}`)).toEqual({
      utm_source: 'x',
      utm_campaign: 'a'.repeat(100)
    });
    expect(readUtmParams('')).toEqual({});
  });

  it('strips query strings and rejects invalid referrers', () => {
    expect(sanitizeReferrer('https://l.threads.net/path?u=private&e=me@example.com')).toBe('https://l.threads.net/path');
    expect(sanitizeReferrer('')).toBeNull();
    expect(sanitizeReferrer('not a url')).toBeNull();
  });
});
