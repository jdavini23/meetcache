import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMarkdown from './ChatMarkdown';

describe('ChatMarkdown', () => {
  it('renders Gemini formatting as safe text elements instead of HTML', () => {
    render(<ChatMarkdown content={'**Try this first:** Take one breath.\n\n- Keep it simple\n- Offer a choice\n\n<script>alert(1)</script>'} />);

    expect(screen.getByText('Try this first:')).toHaveClass('font-semibold');
    expect(screen.getByRole('list')).toHaveTextContent('Keep it simple');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });
});
