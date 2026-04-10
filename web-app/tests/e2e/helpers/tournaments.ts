import { expect, Page, Response } from '@playwright/test';

const LABEL_MAX_PLAYERS = 'M\u00e1ximo jugadores';

function nextYearE2eStartDateIso(): string {
  const y = new Date().getFullYear() + 1;
  return `${y}-06-15`;
}

/** Ranura de 30 min distinta por nombre de torneo (tests en el mismo segundo no colisionan). */
function e2eHalfHourSlotForName(name: string): { start: string; end: string } {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  const slot = Math.abs(h) % 48;
  const toTime = (s: number) => {
    const hh = Math.floor(s / 2) % 24;
    const m = (s % 2) * 30;
    return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  return { start: toTime(slot), end: toTime((slot + 1) % 48) };
}

export async function openTournaments(page: Page) {
  await page.goto('/torneos');
  await expect(page).toHaveURL(/\/torneos/);
}

export async function createTournamentFromWizard(page: Page, name: string, maxPlayers = 8) {
  const totalsCard = page.locator('p:has-text("Torneos Totales")').locator('xpath=preceding-sibling::p[1]').first();
  const beforeTotalText = (await totalsCard.textContent()) ?? '0';
  const beforeTotal = Number(beforeTotalText.replace(/[^\d]/g, '')) || 0;

  await page.getByRole('button', { name: /crear torneo/i }).first().click();
  await expect(page.getByText(/configura horarios, cupos/i)).toBeVisible();

  const createModal = page
    .locator('div.fixed.inset-0')
    .filter({ hasText: /Configura horarios, cupos, Elo y canchas/i })
    .first();
  const wizardFooter = createModal.locator(
    'div.px-6.py-4.border-t.border-gray-200.bg-white.flex.justify-end.gap-2'
  );
  const wizardPrimaryBtn = wizardFooter.getByRole('button').last();

  await createModal.getByPlaceholder('Ej. Copa Primavera').fill(name);
  await createModal.locator('input[type="date"]').first().fill(nextYearE2eStartDateIso());
  const { start: startT, end: endT } = e2eHalfHourSlotForName(name);
  await createModal
    .getByText('Hora de inicio', { exact: true })
    .locator('xpath=following-sibling::div//select')
    .selectOption(startT);
  await createModal
    .getByText('Hora de fin', { exact: true })
    .locator('xpath=following-sibling::div//select')
    .selectOption(endT);
  await createModal.getByRole('button', { name: /^Siguiente$/i }).click();

  await expect(createModal.getByText(LABEL_MAX_PLAYERS, { exact: true })).toBeVisible();
  const maxPlayersInput = createModal
    .getByText(LABEL_MAX_PLAYERS, { exact: true })
    .locator('xpath=following-sibling::div//input');
  await maxPlayersInput.fill(String(maxPlayers));
  await createModal.getByRole('button', { name: /^Siguiente$/i }).click();

  await expect(createModal.getByPlaceholder('Describe formato, premio, reglas...')).toBeVisible({
    timeout: 15_000,
  });

  const courtsCard = createModal
    .getByText('Canchas', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]')
    .first();
  const courtButtons = courtsCard.locator('div.flex.flex-wrap.gap-2').locator('button');

  async function rewindToScheduleAndBumpSlot(bump: number) {
    await expect(wizardPrimaryBtn).toBeEnabled({ timeout: 120_000 });
    const anterior = createModal.getByRole('button', { name: /^Anterior$/i });
    const scheduleHeading = createModal.getByText('Hora de inicio', { exact: true });
    for (let i = 0; i < 2; i++) {
      if (await scheduleHeading.isVisible()) break;
      await expect(anterior).toBeEnabled({ timeout: 120_000 });
      await anterior.click();
    }
    await expect(scheduleHeading).toBeVisible();
    const { start: s, end: e } = e2eHalfHourSlotForName(`${name}:retry${bump}`);
    await scheduleHeading.locator('xpath=following-sibling::div//select').selectOption(s);
    await createModal
      .getByText('Hora de fin', { exact: true })
      .locator('xpath=following-sibling::div//select')
      .selectOption(e);
    await createModal.getByRole('button', { name: /^Siguiente$/i }).click();
    await expect(createModal.getByText(LABEL_MAX_PLAYERS, { exact: true })).toBeVisible();
    await createModal.getByRole('button', { name: /^Siguiente$/i }).click();
    await expect(createModal.getByPlaceholder('Describe formato, premio, reglas...')).toBeVisible({
      timeout: 15_000,
    });
  }

  let createSucceeded = false;
  let lastCreateError = '';
  for (let attempt = 0; attempt < 24; attempt++) {
    if (attempt > 0) {
      await rewindToScheduleAndBumpSlot(attempt);
    }

    const buttonCount = await courtButtons.count();
    if (buttonCount === 0) {
      throw new Error('No hay canchas disponibles para seleccionar en el wizard.');
    }
    const courtIndex = attempt % buttonCount;
    const activeCourtButtons = courtsCard.locator('button.bg-\\[\\#E31E24\\]');
    const activeCount = await activeCourtButtons.count();
    for (let i = 0; i < activeCount; i++) {
      await activeCourtButtons.nth(i).click();
    }
    const pick = courtButtons.nth(courtIndex);
    await pick.click({ force: true, timeout: 15_000 });

    const postTournaments = (res: Response) => {
      if (res.request().method() !== 'POST') return false;
      const p = new URL(res.url()).pathname.replace(/\/$/, '');
      return /\/tournaments(\/recurring)?$/i.test(p);
    };

    let createResponse: Response | null = null;
    try {
      const [, res] = await Promise.all([
        wizardPrimaryBtn.click(),
        page.waitForResponse(postTournaments, { timeout: 55_000 }),
      ]);
      createResponse = res;
    } catch {
      createResponse = null;
    }

    if (/\/torneos\/[0-9a-f-]+/i.test(page.url())) {
      createSucceeded = true;
      break;
    }

    if (await createModal.getByPlaceholder('Describe formato, premio, reglas...').isVisible()) {
      await expect(wizardPrimaryBtn).toBeEnabled({ timeout: 90_000 });
    }

    if (!createResponse) {
      lastCreateError = 'No se captur\u00f3 respuesta al crear torneo';
      continue;
    }

    if (createResponse.ok()) {
      try {
        await page.waitForURL(/\/torneos\/[0-9a-f-]+/i, { timeout: 20_000 });
      } catch {
        /* SPA ya puede estar en detalle */
      }
      if (/\/torneos\/[0-9a-f-]+/i.test(page.url())) {
        createSucceeded = true;
        break;
      }
      createSucceeded = true;
      break;
    }

    let body = '';
    try {
      body = await createResponse.text();
    } catch {
      body = '';
    }
    lastCreateError = `Creaci\u00f3n de torneo fall\u00f3 (${createResponse.status()}): ${body}`;
    if (createResponse.status() !== 409) {
      throw new Error(lastCreateError);
    }
  }

  if (!createSucceeded) {
    throw new Error(lastCreateError || 'No se pudo crear el torneo tras varios intentos de cancha/horario.');
  }

  if (/\/torneos\/[0-9a-f-]+/i.test(page.url())) {
    return;
  }

  await expect
    .poll(async () => {
      const txt = (await totalsCard.textContent()) ?? '0';
      return Number(txt.replace(/[^\d]/g, '')) || 0;
    }, { timeout: 45_000 })
    .toBeGreaterThan(beforeTotal);

  const createModalTitle = page.getByText(/Configura horarios, cupos, Elo y canchas/i);
  if (await createModalTitle.isVisible()) {
    const closeButton = page.getByRole('button', { name: /^Cerrar$/i }).last();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(createModalTitle).toHaveCount(0, { timeout: 10_000 });
  }

  const firstTournamentRow = page.locator('button').filter({ hasText: /Premios\s*\u20ac/ }).first();
  await expect(firstTournamentRow).toBeVisible({ timeout: 30_000 });
  await firstTournamentRow.click({ force: true });
  await expect(page).toHaveURL(/\/torneos\/[0-9a-f-]+/i, { timeout: 30_000 });
}

export async function openCompetitionTab(page: Page) {
  await page.getByRole('button', { name: /competici[\u006f\u00f3]n/i }).click();
  await expect(page.getByText(/configuraci\u00f3n competitiva/i)).toBeVisible();
}
