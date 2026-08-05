# Cache design guide

## Purpose

Cache is a passwordless AI parenting coach that retains useful, parent-provided
context about a child. Its public site introduces the product and collects
early-access interest; the signed-in product lets parents save context and
return to an ongoing conversation. The design should make that promise feel
calm, considerate, and practical—not clinical, overly technical, or overly
cute.

The public page is built to earn enough trust for a parent to share an email
and, after signup, a short indication of what they need help with. The product
experience should carry forward the same reassurance while making account,
privacy, and safety controls easy to find.

## Design principles

1. **Warm, not saccharine.** Use natural color, generous space, and gentle
   illustrations to convey care without relying on childlike graphics.
2. **Clear before clever.** Lead with a simple explanation of the benefit:
   Cache remembers the context, so parents do not have to repeat it.
3. **Calm confidence.** The visual language should reduce cognitive load:
   restrained surfaces, few competing accents, and direct calls to action.
4. **Human guidance, practical boundaries.** Copy should remain supportive and
   avoid implying medical or professional-care replacement.
5. **One primary action per surface.** The public site consistently offers
   “Join early access”; the product surface prioritizes sending a message or
   saving child context without competing calls to action.

## Visual foundation

### Color

| Token | Value | Use |
| --- | --- | --- |
| `cream` | `#FAF6F0` | Primary page background and quiet input fill |
| `ink` | `#2B2622` | Primary text, dark CTA panel, and dark outline |
| `terracotta` | `#C9603F` | Conversion action, brand punctuation, and warm emphasis |
| `sage` | `#6D7D63` | Reassuring status, product context, and secondary emphasis |
| white | `#FFFFFF` | Cards and elevated form surfaces |

Use opacity variants of ink and cream for secondary text, borders, and dark
theme surfaces. Borders are intentionally quiet (`ink/10` on light surfaces;
`cream/10` on dark surfaces). Reserve solid terracotta for actions and small,
meaningful highlights; it should not become a general-purpose decoration color.

### Typography

- **Display and headings:** Fraunces, serif. It adds warmth and a thoughtful,
  editorial character. Section headings use medium weight; selective italics
  provide emphasis.
- **Interface and body:** Inter, sans-serif. Use it for supporting copy, form
  controls, labels, and buttons.
- **Hero heading:** 42px on small screens, 48px at `sm`, and 64px at `md`;
  tight tracking and approximately 1.1 line height.
- **Section heading:** 30–36px, depending on viewport.
- **Body:** 16px by default; hero supporting copy can scale to 20px.
- **Labels:** 10px uppercase Inter with wide tracking, used sparingly for
  eyebrow labels and small metadata.

### Shape, depth, and imagery

- Major cards use a 32px radius. Inputs, buttons, chat bubbles, and icon tiles
  use a smaller 12–16px radius; the navigation CTA is fully pill-shaped.
- White cards have a thin border and a low, soft ink shadow. Hover states only
  deepen that shadow slightly—there is no dramatic lift.
- Decorative forms are soft sage/terracotta glows and organic blobs at low
  opacity. The hero’s small animated plant is the signature illustration.
- Use Lucide icons inside quiet, bordered color-tinted tiles. Keep icon strokes
  simple and avoid mixing illustration styles.

## Layout and page structure

The page uses a cream canvas, 24px horizontal padding (`px-6`), and centered
content. Navigation content is capped at `max-w-6xl`; feature grids at
`max-w-5xl`; narrative and conversion areas at `max-w-4xl` or narrower.
Standard sections have 80px vertical padding on mobile and 112px from the
medium breakpoint upward.

```text
Sticky navigation
Hero: plant + early-access eyebrow + promise + email form
Problem: three reasons generic advice falls short
Product example: two-message conversation
How it works: three-step sequence
Difference: four product-value points
Final CTA: dark conversion card + email form
Footer
```

Keep the story in this order: acknowledge the pain, demonstrate the product,
explain the model, then reinforce the differentiator before the final request.

## Component guidance

### Navigation

The public sticky navigation has a translucent, blurred cream background and a
subtle bottom border. The Cache wordmark is Fraunces with a terracotta period.
Its primary action scrolls smoothly to the hero email input and focuses it.

### Hero and forms

Center the hero and limit the text measure: the headline is `max-w-3xl`, the
supporting text `max-w-xl`, and the form `max-w-md`. On `sm` and above, email
input and submit button share a row; on smaller screens they stack. The light
form is a white elevated card; the final CTA uses the same form controls
without adding a competing white card.

The form has four visible outcomes: default, validation/submission error,
existing or newly saved email with an optional use-case survey, and a thank-you
state. Each outcome needs the same generous 32px rounding, clear copy, and
visible disabled/loading treatment.

### Product experience

The `/app` experience begins with passwordless email sign-in, then provides a
focused chat and a place to maintain child context. Keep the chat legible and
calm: distinguish parent and Cache messages, preserve a clear sending state,
and keep urgent-care guidance visually unambiguous. Account export, deletion,
and privacy information must remain discoverable without interrupting normal
conversation. Do not present Cache as medical or emergency care.

### Information cards

Problem and process cards become three columns at `md`; the product-difference
cards become two columns at `sm`. Preserve a single-column stack below those
breakpoints. Cards use consistent 32px padding and favor short title/body
pairs over dense text.

### Product example

The conversation example is a deliberate proof point, not a realistic chat
interface. Use a neutral right-aligned “You” message and a sage-tinted,
left-aligned “Cache” reply, with distinct circular icon markers. Keep the
example illustrative and avoid making sensitive parenting claims.

### Final CTA and footer

The final CTA is a high-contrast ink card with subtle blurred terracotta and
sage accents. It should feel like a contained invitation, not an alarm. The
footer returns to the quiet cream canvas and presents only the wordmark, brief
tagline, site link, and year.

## Interaction and motion

Motion is slow, small, and purposeful. Content enters with a 15–20px upward
fade, typically over 0.6–0.9 seconds, with modest staggered card reveals.
Hero organic shapes shift subtly with scroll; plant elements gently grow and
sway. Hover feedback is limited to color changes, a slightly stronger shadow,
or a small active press scale.

New interactive elements should honor `prefers-reduced-motion`: remove looping
plant/blob motion and use instant or very short opacity transitions.

## Responsive and accessibility requirements

- Preserve readable text measures and at least 24px page gutters on narrow
  screens; never rely on decorative shapes to communicate content.
- Keep actions large enough to tap comfortably and do not make hover the only
  way to reveal information.
- Provide clear keyboard focus for the navigation CTA, inputs, buttons, and
  footer link. The terracotta focus ring used by the email field should be the
  model for other custom controls.
- Maintain semantic landmarks, heading order, descriptive form labels, and
  status/error messages that are announced to assistive technology.
- Do not convey form success or error through color alone; retain the existing
  icons and explicit text.
- Check text contrast whenever using opacity-based secondary copy, especially
  inside the ink CTA panel.

## Implementation notes

Theme tokens and font registration live in `src/index.css`. Keep component
styling in Tailwind utilities and reuse the existing named color tokens rather
than introducing near-duplicate hex values. Use `motion/react` for the current
motion vocabulary and `lucide-react` for UI icons. New sections should follow
the existing component-per-section structure in `src/components/`.

## Design QA checklist

- Does the first viewport explain the remembered-context value proposition and
  expose the email action without scrolling?
- Are terracotta and sage used as accents rather than competing backgrounds?
- Do grids collapse cleanly, with no cramped cards or overflowing form button?
- Are text, form errors, duplicate signups, survey options, and thank-you
  states legible in both light and dark form contexts?
- Does motion support calmness and remain usable when reduced motion is set?
- Is the final CTA visually distinct while still clearly part of the same
  design system?
- In `/app`, are sign-in, saved context, chat states, privacy controls, and
  urgent-care guidance understandable without relying on color alone?
