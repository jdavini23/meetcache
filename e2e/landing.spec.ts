import { expect, test } from '@playwright/test';

test('the landing page exposes the early-access signup flow', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /parenting guidance that remembers what works for your child/i })).toBeVisible();
  await expect(page.locator('#nav-cta-button')).toHaveText(/get early access/i);
  await expect(page.getByPlaceholder('your@email.com').first()).toBeVisible();
  await expect(page.getByText(/quiet time skipped this week/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /why cache instead of a general ai assistant/i })).toBeVisible();
  await expect(page.getByText(/chatgpt, claude, and gemini are powerful general-purpose assistants/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /your context stays in your control/i })).toBeVisible();
});

test('the waitlist signup reaches the survey with a mocked Supabase response', async ({ page }) => {
  await page.route('**/rest/v1/waitlist*', async (route) => {
    await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/');

  const form = page.getByPlaceholder('your@email.com').first().locator('xpath=ancestor::form');
  await form.getByPlaceholder('your@email.com').fill('parent@example.com');
  await form.getByRole('button', { name: /get early access/i }).click();

  await expect(page.getByText(/what would you want cache's help with first/i)).toBeVisible();
});

test('the mobile hero keeps the complete signup form above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const formContainer = page.locator('#hero-form-container');
  await expect(formContainer).toBeVisible();
  const box = await formContainer.boundingBox();

  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
});

test('the navigation CTA focuses the hero email field', async ({ page }) => {
  await page.goto('/');

  await page.locator('#nav-cta-button').click();
  await expect(page.locator('#hero-email-input')).toBeFocused({ timeout: 2000 });
});

test('the app requests a magic link with a mocked Supabase response', async ({ page }) => {
  await page.route('**/auth/v1/otp*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/app');

  await page.getByPlaceholder('you@example.com').fill('parent@example.com');
  await page.getByRole('button', { name: /send sign-in link/i }).click();

  await expect(page.getByText('Check your email for a secure sign-in link.')).toBeVisible();
});

test('the privacy page explains account data controls', async ({ page }) => {
  await page.goto('/privacy');

  await expect(page.getByRole('heading', { name: /privacy and your data/i })).toBeVisible();
  await expect(page.getByText(/download a copy of your saved context and chat history/i)).toBeVisible();
});
