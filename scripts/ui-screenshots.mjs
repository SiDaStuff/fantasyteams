/* Screenshot smoke-test of the redesigned UI at desktop and mobile sizes. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const routes = [
  ['landing', '/'],
  ['login', '/login'],
  ['register', '/register'],
  ['join', '/join'],
  ['create', '/leagues/new'],
  ['dashboard', '/dashboard'],
  ['nfl', '/nfl'],
];

const sizes = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
];

const browser = await chromium.launch();

for (const [sizeName, viewport] of sizes) {
  const page = await browser.newPage({ viewport });
  for (const [name, path] of routes) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => page.goto(`${BASE}${path}`));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}-${sizeName}.png`, fullPage: true });
    console.log(`${name} ${sizeName} ok`);
  }
  await page.close();
}

await browser.close();
console.log('done');
