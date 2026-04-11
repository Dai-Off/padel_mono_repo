import { expect, Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function logoutIfPossible(page: Page) {
  const logoutTrigger = page.getByRole('button', { name: /cerrar sesión|logout|salir/i });
  if (await logoutTrigger.count()) {
    await logoutTrigger.first().click();
  }
}

