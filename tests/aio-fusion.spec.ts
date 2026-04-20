import { test, expect } from '@playwright/test';

test('AIO Fusion E2E Flow', async ({ page }) => {
  // 1. Landing page loads with "Business visibility for the AI Age" hero headline
  await page.goto('/');
  const headline = page.locator('h1');
  await expect(headline).toContainText('Business visibility');
  await expect(headline).toContainText('for the AI Age');

  // 2. Clicking "Platform Login" enters the dashboard
  // Based on code: <button onClick={onLogin} ...> <LogIn size={14} /> Platform Login </button>
  const loginButton = page.getByRole('button', { name: 'Platform Login' }).first();
  await loginButton.click();
  
  // After login, we should see the Client Hub or Dashboard
  // The first page after onLogin is usually ClientSelectorPage (Client Hub)
  await expect(page.getByText('Client Hub')).toBeVisible();
  
  // Select a client to enter the actual dashboard
  await page.getByText('Bluhalo').click();
  await expect(page.getByText('Intelligence Dashboard')).toBeVisible();

  // 3. The sidebar shows grouped sections including "Authority Planner", "Release Gateway", "Archive", "Client Intake"
  const sidebar = page.locator('aside');
  await expect(sidebar.getByRole('button', { name: 'Authority Planner' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Release Gateway' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Archive' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Client Intake' })).toBeVisible();

  // 4. Clicking "Authority Planner" opens the weekly grid showing "Projected total score" and "Visibility" / "Authority" cards plus a "New project" button
  await sidebar.getByRole('button', { name: 'Authority Planner' }).click();
  await expect(page.getByText('Projected total score')).toBeVisible();
  await expect(page.getByText('Visibility', { exact: true })).toBeVisible();
  await expect(page.getByText('Authority', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible(); // Weekly grid is a table

  // 5. Clicking "New project" opens the edit modal with fields for project title, content type, status, channels
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByText('Edit project')).toBeVisible();
  await expect(page.getByLabel('Project title')).toBeVisible();
  await expect(page.getByLabel('Content type')).toBeVisible();
  await expect(page.getByLabel('Status')).toBeVisible();
  await expect(page.getByText('Release channels (multi-select)')).toBeVisible();
  
  // Close modal
  await page.getByRole('button', { name: '×' }).click();

  // 6. Clicking "Client Intake" shows a "Tech Intake" / "Content Intake" tab toggle
  await sidebar.getByRole('button', { name: 'Client Intake' }).click();
  await expect(page.getByRole('button', { name: 'Tech Intake' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Content Intake' })).toBeVisible();

  // 7. Clicking "Content Intake" tab switches the visible sections
  await page.getByRole('button', { name: 'Content Intake' }).click();
  // Check for some content-specific field
  await expect(page.getByText('Tone of Voice')).toBeVisible();

  // 8. The Content Optimiser page shows "Push to Planner" and "Approve & archive" buttons
  await sidebar.getByRole('button', { name: 'Content Optimiser' }).click();
  // We might need to click on a content item first or see the buttons in the editor
  // In ContentOptimiser (optimiser id), it shows the editor if a draft is selected or there's a default
  await expect(page.getByRole('button', { name: 'Push to Planner' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve & archive' })).toBeVisible();

  // 9. The Measure & Report page exposes a "Released Content" tab
  await sidebar.getByRole('button', { name: 'Measure & Report' }).click();
  await expect(page.getByRole('button', { name: 'Released Content' })).toBeVisible();
});
