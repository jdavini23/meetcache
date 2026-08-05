import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WaitlistForm from './WaitlistForm';

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn();
  return { insert, from: vi.fn(() => ({ insert })) };
});

vi.mock('../lib/supabase', () => ({ supabase: { from } }));

describe('WaitlistForm', () => {
  beforeEach(() => {
    insert.mockReset();
    from.mockClear();
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

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ email: 'parent@example.com', source: 'landing' }));
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
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

    expect(await screen.findByText('Thanks — that helps.')).toBeInTheDocument();
  });
});
