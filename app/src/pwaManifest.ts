/**
 * Web app manifest, kept out of `vite.config.ts` so it can be asserted
 * against the actual files in `public/` — see `pwaManifest.test.ts`.
 *
 * Icon `sizes` are a claim about bytes on disk. Chrome checks it and logs
 * "Actual image size (AxB) does not match specified size (CxD)" when the
 * claim is wrong, which is exactly what a hand-written entry gets wrong.
 */
export const pwaManifest = {
  name: 'Ink & Stone',
  short_name: 'Ink & Stone',
  description: 'A campaign journal for your Stonetop table.',
  start_url: '/',
  display: 'standalone' as const,
  // = --bg-primary-flat (index.css) : le papier tel qu'il est peint, grain
  // composité, et non le token --bg-primary nu. Un manifest ne peut pas lire
  // var() : la troisième copie vit dans le meta theme-color d'index.html —
  // retoucher les trois ensemble, le token restant la référence.
  background_color: '#E6E0D5',
  theme_color: '#E6E0D5',
  // One entry, measured rather than assumed. `apple-touch-icon.png` is NOT
  // listed: iOS reads it from `<link rel="apple-touch-icon">` in the HTML, and
  // it is the same 512x512 image, so a second entry would add nothing but
  // another size claim to get wrong.
  icons: [
    { src: '/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' as const },
  ],
};
