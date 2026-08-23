import { test, expect } from '@playwright/test';

/**
 * The offline app shell, verified in a real browser against the real build.
 *
 * These assertions exist because the unit suite cannot make them: jsdom has no
 * service worker, no Cache Storage, and no way to cut the network and reload.
 * Every regression here has already happened once — a manifest link pointing
 * at a file that only exists after a build, a navigation fallback swallowing
 * the MCP endpoint, fonts still coming from a CDN.
 */

test('registers and activates the service worker', async ({ page }) => {
  await page.goto('/');

  const sw = await page.evaluate(async () => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const reg = await navigator.serviceWorker.getRegistration();
      const worker = reg?.active ?? reg?.waiting ?? reg?.installing;
      if (worker?.state === 'activated') return { scriptURL: worker.scriptURL, state: worker.state };
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  });

  expect(sw, 'no activated service worker').not.toBeNull();
  expect(sw!.scriptURL).toContain('/sw.js');
});

test('precaches the shell and the latin fonts', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  const urls = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) out.push(req.url);
    }
    return out;
  });

  expect(urls.some((u) => u.endsWith('/') || u.includes('index.html'))).toBe(true);
  // Precache keys carry a `?__WB_REVISION__=` suffix, so these cannot anchor on $.
  expect(urls.some((u) => /-latin\.woff2(\?|$)/.test(u)), 'latin fonts not precached').toBe(true);
  // latin-ext is ~600 kB most sessions never touch — runtime-cached, not precached.
  expect(urls.some((u) => /-latin-ext\.woff2(\?|$)/.test(u))).toBe(false);
});

test('serves a valid manifest, linked exactly once', async ({ page }) => {
  await page.goto('/');

  const links = await page.locator('link[rel="manifest"]').count();
  expect(links, 'a hand-written manifest link duplicates the injected one').toBe(1);

  const res = await page.request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.name).toBe('Ink & Stone');
  expect(body.icons.length).toBeGreaterThan(0);
});

test('renders after a reload with the network cut', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker only controls the page once it has claimed it.
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
      );
    }
  });

  await context.setOffline(true);
  const response = await page.reload({ waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);

  // Not just a 200 — React actually mounted from precached JS.
  await expect(page.locator('#root')).not.toBeEmpty();
  await context.setOffline(false);
});

test('does not let the service worker answer /mcp with the SPA', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // `wrangler.jsonc` routes /mcp to the Worker via `run_worker_first`. If the
  // navigation fallback is not denylisted, the worker serves index.html here
  // and the MCP endpoint starts answering HTML in production — invisible to
  // every other test, because the suite calls worker.fetch directly.
  const html = await page.evaluate(async () => {
    const res = await fetch('/mcp', { headers: { Accept: 'text/html' } });
    return res.ok ? (await res.text()).slice(0, 200) : `status:${res.status}`;
  });

  expect(html).not.toContain('<div id="root">');
});
