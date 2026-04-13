import { expect, test } from '@playwright/test';
import { ownerAccount, playerAccounts } from './fixtures/accounts';
import { login } from './helpers/auth';
import { createTournamentFromWizard, openCompetitionTab, openTournaments } from './helpers/tournaments';

test.describe('Torneos - Flujo organizador', () => {
  test.describe.configure({ timeout: 180_000 });

  test('crear torneo en wizard de 3 pasos', async ({ page }) => {
    await login(page, ownerAccount.email, ownerAccount.password);
    await openTournaments(page);

    const tournamentName = `QA Americano ${Date.now()}`;
    await createTournamentFromWizard(page, tournamentName, 8);
    await expect(page).toHaveURL(/\/torneos\/[0-9a-f-]+/i);
  });

  test('verificar tipos Americano/Mexicano/Pozo y descripciones', async ({ page }) => {
    await login(page, ownerAccount.email, ownerAccount.password);
    await openTournaments(page);

    const tournamentName = `QA Tipos ${Date.now()}`;
    await createTournamentFromWizard(page, tournamentName, 8);
    await openCompetitionTab(page);

    const formatSelect = page.locator('select').first();
    await expect(formatSelect).toContainText('Americano');
    await expect(formatSelect).toContainText('Mexicano');
    await expect(formatSelect).toContainText('Pozo');

    await formatSelect.selectOption('round_robin');
    await expect(page.locator('p', { hasText: 'Americano' }).first()).toBeVisible();
    await expect(page.getByText(/Mezcla social/i)).toBeVisible();

    await formatSelect.selectOption('group_playoff');
    await expect(page.locator('p', { hasText: 'Mexicano' }).first()).toBeVisible();
    await expect(page.getByText(/Partidos nivelados/i)).toBeVisible();

    await formatSelect.selectOption('single_elim');
    await expect(page.locator('p', { hasText: 'Pozo' }).first()).toBeVisible();
    await expect(page.getByText(/Organización automática/i)).toBeVisible();
  });

  test(
    'invitar 8 jugadores a un torneo',
    async ({ page }) => {
      test.setTimeout(20 * 60 * 1000);
      await login(page, ownerAccount.email, ownerAccount.password);
      await openTournaments(page);

      const tournamentName = `QA Invitaciones ${Date.now()}`;
      await createTournamentFromWizard(page, tournamentName, 8);
      await page.getByRole('button', { name: /jugadores/i }).click();

      for (const player of playerAccounts.slice(0, 8)) {
        await page.getByRole('button', { name: /añadir participante/i }).click();
        await expect(page.getByText('Email invitación (guest o jugador)')).toBeVisible();
        const addModal = page.locator('div.fixed.inset-0').filter({ hasText: 'Email invitación (guest o jugador)' }).first();

        await addModal.locator('input[placeholder="invitado@correo.com"]').fill(player.email);
        await addModal.getByRole('button', { name: /^Invitar$/ }).click();

        await expect(page.getByText(/Invitaci\u00f3n enviada/i).first()).toBeVisible({ timeout: 120_000 });

        await addModal.getByRole('button', { name: /^Cerrar$/ }).click();
        await expect(page.getByText('Email invitación (guest o jugador)')).toBeHidden({ timeout: 10_000 });
      }
    },
    { timeout: 20 * 60 * 1000 }
  );
});

