import { test, expect } from '@playwright/test';

const CONTACT_PATH = '/contact';

// ── Book a Demo ──────────────────────────────────────────────────────────────

test.describe('Book a Demo form', () => {
  test('submits to /api/contact/book-demo with correct field names and shows success', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedUrl = '';

    await page.route('**/api/contact/book-demo', async (route) => {
      capturedUrl = route.request().url();
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(CONTACT_PATH);

    // Fill the Book a Demo form (first form on the page)
    await page.getByLabel('Your name').first().fill('Jane Smith');
    await page.getByLabel('Work email').first().fill('jane@agency.com');
    await page.getByLabel('Company').first().fill('Agency Co');
    await page.getByLabel('What are you hoping to achieve?').fill('Improve AI visibility for clients.');

    await page.getByRole('button', { name: 'Request a Demo' }).click();

    // Verify the correct endpoint was hit
    expect(capturedUrl).toMatch(/\/api\/contact\/book-demo$/);

    // Verify all expected fields are present with correct names
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['name']).toBe('Jane Smith');
    expect(capturedBody!['email']).toBe('jane@agency.com');
    expect(capturedBody!['company']).toBe('Agency Co');
    expect(capturedBody!['goal']).toBe('Improve AI visibility for clients.');

    // Success state should appear
    await expect(page.getByText('Request received')).toBeVisible();
    await expect(page.getByText("We'll be in touch within one business day")).toBeVisible();
  });

  test('shows server-returned error message when API responds with an error', async ({ page }) => {
    await page.route('**/api/contact/book-demo', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'A valid email address is required.' }),
      });
    });

    await page.goto(CONTACT_PATH);

    await page.getByLabel('Your name').first().fill('Jane Smith');
    await page.getByLabel('Work email').first().fill('jane@agency.com');
    await page.getByLabel('Company').first().fill('Agency Co');
    await page.getByLabel('What are you hoping to achieve?').fill('Test goal text here.');

    await page.getByRole('button', { name: 'Request a Demo' }).click();

    // Error from the server should be shown
    await expect(page.getByText('A valid email address is required.')).toBeVisible();

    // Success state should NOT appear
    await expect(page.getByText('Request received')).not.toBeVisible();
  });

  test('shows network error message when the request fails', async ({ page }) => {
    await page.route('**/api/contact/book-demo', async (route) => {
      await route.abort('failed');
    });

    await page.goto(CONTACT_PATH);

    await page.getByLabel('Your name').first().fill('Jane Smith');
    await page.getByLabel('Work email').first().fill('jane@agency.com');
    await page.getByLabel('Company').first().fill('Agency Co');
    await page.getByLabel('What are you hoping to achieve?').fill('Test goal text here.');

    await page.getByRole('button', { name: 'Request a Demo' }).click();

    await expect(page.getByText(/network error/i)).toBeVisible();
  });

  test('does not submit when required fields are empty (HTML5 validation)', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/contact/book-demo', async (route) => {
      callCount++;
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(CONTACT_PATH);

    // Click submit without filling anything
    await page.getByRole('button', { name: 'Request a Demo' }).click();

    // Wait a tick — if the request had been sent it would have resolved
    await page.waitForTimeout(300);

    expect(callCount).toBe(0);
    // Success state should not be shown
    await expect(page.getByText('Request received')).not.toBeVisible();
  });
});

// ── General Enquiry ───────────────────────────────────────────────────────────

test.describe('General Enquiry form', () => {
  test('submits to /api/contact/enquiry with correct field names and shows success', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedUrl = '';

    await page.route('**/api/contact/enquiry', async (route) => {
      capturedUrl = route.request().url();
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(CONTACT_PATH);

    // The Enquiry form is the second form — labels are shared so we use nth()
    const nameInputs = page.getByLabel('Your name');
    const emailInputs = page.getByLabel('Work email');

    await nameInputs.nth(1).fill('Bob Jones');
    await emailInputs.nth(1).fill('bob@company.com');
    // Company is optional in the enquiry form — skip it to keep things simple
    await page.getByLabel('Subject').fill('Partnership question');
    await page.getByLabel('Message').fill('We would like to explore a partnership opportunity.');

    await page.getByRole('button', { name: 'Send Message' }).click();

    // Verify the correct endpoint was hit
    expect(capturedUrl).toMatch(/\/api\/contact\/enquiry$/);

    // Verify all expected field names
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['name']).toBe('Bob Jones');
    expect(capturedBody!['email']).toBe('bob@company.com');
    expect(capturedBody!['subject']).toBe('Partnership question');
    expect(capturedBody!['message']).toBe('We would like to explore a partnership opportunity.');

    // Success state
    await expect(page.getByText('Message received')).toBeVisible();
    await expect(page.getByText('A member of our team will get back to you')).toBeVisible();
  });

  test('sends company field when filled in', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('**/api/contact/enquiry', async (route) => {
      capturedBody = await route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto(CONTACT_PATH);

    const nameInputs = page.getByLabel('Your name');
    const emailInputs = page.getByLabel('Work email');
    const companyInputs = page.getByLabel('Company');

    await nameInputs.nth(1).fill('Bob Jones');
    await emailInputs.nth(1).fill('bob@company.com');
    await companyInputs.nth(1).fill('Beta Corp');
    await page.getByLabel('Subject').fill('Question');
    await page.getByLabel('Message').fill('Just a quick question.');

    await page.getByRole('button', { name: 'Send Message' }).click();

    expect(capturedBody!['company']).toBe('Beta Corp');
    await expect(page.getByText('Message received')).toBeVisible();
  });

  test('shows server-returned error message when API responds with an error', async ({ page }) => {
    await page.route('**/api/contact/enquiry', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'A subject is required.' }),
      });
    });

    await page.goto(CONTACT_PATH);

    const nameInputs = page.getByLabel('Your name');
    const emailInputs = page.getByLabel('Work email');

    await nameInputs.nth(1).fill('Bob Jones');
    await emailInputs.nth(1).fill('bob@company.com');
    await page.getByLabel('Subject').fill('Test subject');
    await page.getByLabel('Message').fill('Test message body.');

    await page.getByRole('button', { name: 'Send Message' }).click();

    await expect(page.getByText('A subject is required.')).toBeVisible();
    await expect(page.getByText('Message received')).not.toBeVisible();
  });

  test('shows network error message when the request fails', async ({ page }) => {
    await page.route('**/api/contact/enquiry', async (route) => {
      await route.abort('failed');
    });

    await page.goto(CONTACT_PATH);

    const nameInputs = page.getByLabel('Your name');
    const emailInputs = page.getByLabel('Work email');

    await nameInputs.nth(1).fill('Bob Jones');
    await emailInputs.nth(1).fill('bob@company.com');
    await page.getByLabel('Subject').fill('Test subject');
    await page.getByLabel('Message').fill('Test message body.');

    await page.getByRole('button', { name: 'Send Message' }).click();

    await expect(page.getByText(/network error/i)).toBeVisible();
  });

  test('does not submit when required fields are empty (HTML5 validation)', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/contact/enquiry', async (route) => {
      callCount++;
      await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    await page.goto(CONTACT_PATH);

    // Click submit without filling anything
    await page.getByRole('button', { name: 'Send Message' }).click();

    await page.waitForTimeout(300);

    expect(callCount).toBe(0);
    await expect(page.getByText('Message received')).not.toBeVisible();
  });
});
