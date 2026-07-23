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
    await user.click(screen.getByRole('button', { name: /join early access/i }));

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ email: 'parent@example.com', source: 'landing' }));
    expect(await screen.findByText(/what would you want cache's help with first/i)).toBeInTheDocument();
  });

  it('explains when the email address already exists', async () => {
    const user = userEvent.setup();
    insert.mockResolvedValue({ error: { code: '23505' } });
    render(<WaitlistForm idPrefix="test" />);

    await user.type(screen.getByPlaceholderText('your@email.com'), 'parent@example.com');
    await user.click(screen.getByRole('button', { name: /join early access/i }));

    expect(await screen.findByText('We have you down.')).toBeInTheDocument();
  });
});
