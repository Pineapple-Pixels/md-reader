import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetchPublic } from '@shared/api';
import { DEFAULT_DESIGN, fontById, type OrgBrand, type OrgDesign } from '@shared/design';

const RADIUS_PX = { none: '0px', sm: '4px', md: '10px', lg: '18px' } as const;

export function orgBrandQuery(org: string) {
  return {
    queryKey: ['org-design', org] as const,
    queryFn: () => apiFetchPublic<OrgBrand>(org, '/design'),
    staleTime: 5 * 60 * 1000,
  };
}

export function useOrgBrand(org: string | null | undefined) {
  return useQuery({ ...orgBrandQuery(org ?? ''), enabled: !!org });
}

/** CSS custom properties for a document design; values were validated by the server schema. */
export function designVars(d: OrgDesign): CSSProperties {
  const c = d.colors;
  return {
    '--doc-bg': c.bg, '--doc-text': c.text, '--doc-heading': c.heading, '--doc-link': c.link,
    '--doc-border': c.border, '--doc-code-bg': c.codeBg, '--doc-quote': c.quote, '--doc-table-head': c.tableHead,
    '--doc-font-body': fontById(d.fonts.body).stack,
    '--doc-font-heading': fontById(d.fonts.heading).stack,
    '--doc-font-mono': fontById(d.fonts.mono).stack,
    '--doc-radius': RADIUS_PX[d.radius],
    '--doc-gap': d.density === 'compact' ? '0.5em' : '0.8em',
    '--doc-pad': d.density === 'compact' ? '20px' : '32px',
  } as CSSProperties;
}

function useDesignFonts(d: OrgDesign): void {
  useEffect(() => {
    for (const id of [d.fonts.body, d.fonts.heading, d.fonts.mono]) {
      const font = fontById(id);
      const linkId = `gf-${font.id}`;
      if (!font.google || document.getElementById(linkId)) continue;
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
      document.head.appendChild(link);
    }
  }, [d.fonts.body, d.fonts.heading, d.fonts.mono]);
}

/** Code highlighting follows the document's base, not the app theme. */
function useCodeTheme(base: OrgDesign['base']): void {
  useEffect(() => {
    const light = document.getElementById('hljs-light') as HTMLLinkElement | null;
    const dark = document.getElementById('hljs-dark') as HTMLLinkElement | null;
    if (light) light.disabled = base === 'dark';
    if (dark) dark.disabled = base !== 'dark';
  }, [base]);
}

/**
 * Renders a document with its organization's design (colors, fonts, shape, logo, name).
 * `preview` overrides the stored brand, for the admin design editor.
 */
export function DocFrame({ org, preview, children }: { org: string | null | undefined; preview?: OrgBrand; children: ReactNode }) {
  const { data } = useOrgBrand(preview ? null : org);
  const brand = preview ?? data;
  const design = brand?.design ?? DEFAULT_DESIGN;
  useDesignFonts(design);
  useCodeTheme(design.base);

  return (
    <div className="doc-sheet" style={designVars(design)}>
      {brand && (
        <header className="doc-brand">
          {brand.logoUrl && <img src={brand.logoUrl} alt="" />}
          <span>{brand.name}</span>
        </header>
      )}
      {children}
    </div>
  );
}
