// Browser checks for the public homepage. Screenshots stay outside the repository.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5174';
const output = process.env.SCREENSHOT_DIR ?? join(tmpdir(), 'fantasyteams-homepage-preview');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const failures = [];
try {
  for (const width of [375, 768, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', (error) => failures.push(`${width}: ${error.message}`));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#hero-title').waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Trigger section entrances before capturing the complete page.
    for (const selector of ['#how-it-works', '.home-features', '.home-final-cta']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${width}: page overflow`);
    const overflowing = await page.locator('.home table, .home-feature-preview, .home-league-preview').evaluateAll((elements) => elements.filter((el) => el.getBoundingClientRect().right > innerWidth).map((el) => el.className));
    assert.deepEqual(overflowing, [], `${width}: preview overflow`);
    await page.screenshot({ path: join(output, `homepage-${width}.png`), fullPage: true });
    await page.screenshot({ path: join(output, `hero-${width}.png`) });

    await page.getByRole('button', { name: 'Championship odds', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Championship odds', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Standings', exact: true }).click();
    await page.getByRole('button', { name: 'Preview Detroit Lions', exact: true }).click();
    assert.equal(await page.locator('.home-draft-selection strong').textContent(), 'Detroit Lions');
    await page.getByRole('button', { name: 'Preview Buffalo Bills', exact: true }).click();

    await page.evaluate(() => window.scrollTo(0, 0));
    if (width < 768) {
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      await page.screenshot({ path: join(output, `menu-${width}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      assert.equal(await menu.evaluate((el) => el === document.activeElement), true);
      await menu.click();
      await page.locator('#mobile-navigation').getByRole('link', { name: 'How It Works' }).click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    } else {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'How It Works' }).click();
    }
    await page.waitForTimeout(550);
    assert.equal(new URL(page.url()).hash, '#how-it-works');
    assert.ok(await page.locator('#how-it-works').evaluate((el) => Math.abs(el.getBoundingClientRect().top - 80) < 5));
    await page.getByRole('link', { name: 'Join a League', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/join');
    await page.locator('.site-footer').getByRole('link', { name: 'How It Works' }).click();
    await page.waitForTimeout(600);
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(new URL(page.url()).hash, '#how-it-works');
    await page.getByRole('link', { name: 'Create a League', exact: true }).first().click();
    await page.waitForURL('**/login');
    await page.goto(base);
    if (width < 768) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.locator('#mobile-navigation').getByRole('link', { name: 'Get Started' }).click();
    } else {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Get Started' }).click();
    }
    await page.waitForURL('**/register');
    await page.close();
    console.log(`${width}px: layout, sample controls, menu, anchor links, and CTA routes passed`);
  }
  const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  assert.equal(await page.locator('.home-hero-copy').evaluate((el) => getComputedStyle(el).animationName), 'none');
  console.log('Reduced motion passed');
  assert.deepEqual(failures, [], 'Browser runtime errors');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
