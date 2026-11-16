import { describe, it, expect } from 'vitest';
import { OrgDesignSchema, ThemeBodySchema, readDesign, sniffImage } from '../src/lib/design.js';
import { DEFAULT_DESIGN, THEME_PRESETS } from '../shared/design.js';

describe('OrgDesignSchema', () => {
  it('should accept the default design when validated', () => {
    expect(OrgDesignSchema.safeParse(DEFAULT_DESIGN).success).toBe(true);
  });

  it('should lowercase colors when they come in upper case', () => {
    const parsed = OrgDesignSchema.parse({ ...DEFAULT_DESIGN, colors: { ...DEFAULT_DESIGN.colors, bg: '#ABCDEF' } });
    expect(parsed.colors.bg).toBe('#abcdef');
  });

  it.each([
    ['a CSS injection in a color', { colors: { ...DEFAULT_DESIGN.colors, bg: 'red;background:url(x)' } }],
    ['a short hex color', { colors: { ...DEFAULT_DESIGN.colors, link: '#fff' } }],
    ['a font outside the list', { fonts: { ...DEFAULT_DESIGN.fonts, body: 'Comic Sans' } }],
    ['a mono font in the body slot', { fonts: { ...DEFAULT_DESIGN.fonts, body: 'jetbrains-mono' } }],
    ['an unknown radius', { radius: 'xl' }],
    ['an extra field', { css: 'body{display:none}' }],
    ['an extra color', { colors: { ...DEFAULT_DESIGN.colors, extra: '#000000' } }],
  ])('should reject %s', (_label, patch) => {
    expect(OrgDesignSchema.safeParse({ ...DEFAULT_DESIGN, ...patch }).success).toBe(false);
  });
});

describe('readDesign', () => {
  it('should fall back to the default when nothing is stored', () => {
    expect(readDesign(null)).toEqual(DEFAULT_DESIGN);
  });

  it('should fall back to the default when the stored design no longer validates', () => {
    expect(readDesign({ ...DEFAULT_DESIGN, radius: 'gone' })).toEqual(DEFAULT_DESIGN);
  });
});

describe('ThemeBodySchema', () => {
  const colored = THEME_PRESETS.find((t) => t.id === 'black-violet')!;

  it('should accept every colored preset when saved as a custom theme', () => {
    for (const t of THEME_PRESETS.filter((p) => p.tokens.colors)) {
      expect(ThemeBodySchema.safeParse({ name: t.name, tokens: t.tokens }).success).toBe(true);
    }
  });

  it('should reject a theme without colors, an empty name or a bad color', () => {
    expect(ThemeBodySchema.safeParse({ name: 'x', tokens: { base: 'light', colors: null } }).success).toBe(false);
    expect(ThemeBodySchema.safeParse({ name: '  ', tokens: colored.tokens }).success).toBe(false);
    const bad = { ...colored.tokens, colors: { ...colored.tokens.colors!, accent: 'violet' } };
    expect(ThemeBodySchema.safeParse({ name: 'x', tokens: bad }).success).toBe(false);
  });
});

describe('sniffImage', () => {
  it('should detect PNG, JPEG and WebP from their first bytes', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'ascii'))).toBe('webp');
  });

  it('should reject SVG and other content even when it claims to be an image', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('readableOn', () => {
  it.each([
    ['#c0392b', '#ffffff'],
    ['#1b3a5c', '#ffffff'],
    ['#9e8245', '#141413'],
    ['#f5d547', '#141413'],
    ['#ffffff', '#141413'],
  ])('should pick %s -> %s for text on that accent', async (bg, expected) => {
    const { readableOn } = await import('../shared/design.js');
    expect(readableOn(bg)).toBe(expected);
  });
});
