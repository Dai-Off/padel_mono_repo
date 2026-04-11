import { expect, test } from '@playwright/test';
import { playerAccounts } from './fixtures/accounts';
import { login } from './helpers/auth';

test.describe('Torneos - Flujo jugador', () => {
  test('jugador puede iniciar sesión y navegar sin romper torneos', async ({ page }) => {
    const player = playerAccounts[0];
    await login(page, player.email, player.password);

    await page.goto('/torneos');
    await expect(page).toHaveURL(/\/torneos/);

    // El comportamiento depende del rol/club asociado, pero no debe romper.
    await expect(
      page.getByText(/no hay club asociado|torneos|gestión de torneos|detalle de torneo/i).first()
    ).toBeVisible();
  });
});

