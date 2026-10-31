import Image from 'next/image';

/**
 * The brand mark.
 *
 * **The wordmark, rendered as a pair of theme-swapped images.**
 * DESIGN.md's brand direction is *warm minimalism* — one terracotta
 * accent, an evergreen second accent, and no ornament.
 *
 * ## Why two images rather than one SVG
 *
 * **The mark is a hard-coded-colour SVG, so `currentColor` cannot reach
 * into it.** An SVG loaded through `<img src="...">` renders in an
 * isolated context: `currentColor` inside it resolves to the user-agent
 * default rather than inheriting the host element's colour. CSS
 * `mask-image` can recolour it, but that depends on the SVG rendering with
 * opaque pixels, which is fragile for a line-art mark scaled down.
 *
 * So the mockup's pattern is used: **the light and the dark variant are
 * two `<img>` elements, and CSS shows exactly one of them.** The swap is
 * a `display` change rather than an opacity fade, so the hidden variant
 * is genuinely out of the layout and out of the accessibility tree.
 *
 * ## The accessible name
 *
 * **The images carry empty `alt`s, and the name comes from the link.**
 * The wordmark is the product's name, and it is the link's accessible
 * name everywhere it appears — `FindBack home` on the topbar's home link.
 * Rendering the name as text alongside the images would announce it
 * twice, so the images stay decorative.
 */

/** The brand mark's props. */
export interface BrandMarkProps {
  /** An optional class name, for layout. */
  readonly className?: string | undefined;
}

/**
 * The FindBack wordmark.
 *
 * **The link is presentational on the landing page** and a link elsewhere;
 * the caller decides, because a wordmark that is a link on the landing page
 * would navigate to the page you are already on.
 */
export function BrandMark({ className }: BrandMarkProps): React.JSX.Element {
  return (
    <span className={className ? `brand-mark ${className}` : 'brand-mark'}>
      {/*
        **The two variants are siblings, and CSS shows one of them.**
        The `data-theme-variant` attribute is the hook — the stylesheet
        hides the dark one in the light theme and the light one in the
        dark theme. `next/image` passes the attribute straight through to
        the `<img>` it renders, and an SVG is served unoptimized by
        default, so the asset is served exactly as authored.
      */}
      <Image
        className="brand-mark__image"
        src="/brand/logo-wordmark-light.svg"
        alt=""
        width={240}
        height={64}
        data-theme-variant="light"
      />
      <Image
        className="brand-mark__image"
        src="/brand/logo-wordmark-dark.svg"
        alt=""
        width={240}
        height={64}
        data-theme-variant="dark"
      />
    </span>
  );
}

/**
 * The large brand mark used on the landing art panel and the login card.
 *
 * **Decorative** — the page heading already names FindBack, so the
 * images stay `aria-hidden` with empty `alt`s.
 */
export function BrandHero({ size = 160 }: { readonly size?: number | undefined }): React.JSX.Element {
  return (
    <div className="auth-card__logo" aria-hidden="true">
      <Image
        src="/brand/logo-mark-light.svg"
        alt=""
        width={size}
        height={size}
        data-theme-variant="light"
      />
      <Image
        src="/brand/logo-mark-dark.svg"
        alt=""
        width={size}
        height={size}
        data-theme-variant="dark"
      />
    </div>
  );
}
