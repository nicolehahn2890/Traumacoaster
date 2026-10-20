/**
 * illudiy-Farbtoken (tokens/colors.css des Designsystems): drei Familien Teal, Pink, Violett,
 * je Basis, Tone, Pop, Mist, Night. Seite und Fließtextfarbe sind aus Violett-Night abgeleitet.
 */
export const BRAND = {
  teal: '#00c6b5',
  tealTone: '#049b97',
  tealPop: '#39ffe5',
  tealMist: '#95c4be',
  tealNight: '#0f404f',
  pink: '#ff68a9',
  pinkTone: '#8e107f',
  pinkPop: '#eb1b9d',
  pinkMist: '#ff8ec0',
  pinkNight: '#38003e',
  violet: '#4b24cf',
  violetTone: '#7a40df',
  violetPop: '#936dff',
  violetMist: '#939cf0',
  violetNight: '#001753',
  page: '#f6f7fc',
  muted: '#6b7299',
  white: '#ffffff',
} as const;

/** Sticker-Kontur, wie im Logo (--outline) */
export const BRAND_OUTLINE = BRAND.tealNight;
