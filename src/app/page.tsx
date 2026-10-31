import Image from 'next/image';
import Link from 'next/link';

import type { Metadata } from 'next';

import {
  LANDING_BROWSE,
  LANDING_CREATE_ACCOUNT,
  LANDING_EYEBROW,
  LANDING_HERO_LEDE,
  LANDING_HERO_TITLE,
  LANDING_HOW_TITLE,
  LANDING_STEPS,
  SIGN_IN,
} from '@/ui/copy';

export const metadata: Metadata = {
  title: {
    absolute: 'FindBack — Return lost items to their people',
  },
};

/**
 * The landing page.
 *
 * **§9.1:** *"Brand mark, value proposition (1 paragraph), `Sign in` and
 * `Register` CTAs. Below the fold: a 'Browse the listings' link to
 * `/listings` so visitors can see what FindBack is before signing up."*
 *
 * ## The layout is the BMAD mockup's
 *
 * The visual design is
 * `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/mockups/public/01-landing.html`
 * — a two-column hero with the copy on the left and the brand mark on the
 * right, and a three-up "How FindBack works" section beneath it. The
 * stylesheet carries those rules under `.landing__*`.
 *
 * ## The copy is §9.1's
 *
 * The mockup's wording is *not* copied wholesale: §9.1 fixes this
 * surface's content, and `BROWSE_THE_LISTINGS` is the phrase the
 * specification names. The mockup's structure is the design; the
 * specification's words are the content.
 *
 * ## The brand mark is a pair of images, not an inline SVG
 *
 * **The mark is a hard-coded-colour SVG, so `currentColor` cannot reach
 * into it.** The mockup solves this by rendering the light and the dark
 * variant as two `<img>` elements and letting CSS show one of them; the
 * same pattern is used here, and `next/image` optimises both.
 */
export default function HomePage(): React.JSX.Element {
  return (
    <div className="landing">
      <section className="landing__hero" aria-labelledby="hero-title">
        <div>
          <span className="landing__eyebrow">{LANDING_EYEBROW}</span>

          <h1 id="hero-title" className="landing__title">
            {LANDING_HERO_TITLE}
          </h1>

          <p className="landing__lede">{LANDING_HERO_LEDE}</p>

          <div className="landing__cta-row">
            <Link
              href="/login"
              className="button button--primary landing__cta landing__cta--primary"
            >
              {SIGN_IN}
            </Link>

            <Link href="/register" className="button button--secondary landing__cta">
              {LANDING_CREATE_ACCOUNT}
            </Link>
          </div>

          {/*
            **Below the fold.** §9.1 puts this link after the CTAs, so a
            visitor sees what FindBack is before they are asked to commit
            to an account. It is a plain text link rather than a third
            button — it is the lower-commitment path.
          */}
          <Link href="/listings" className="landing__browse">
            {LANDING_BROWSE}
          </Link>
        </div>

        {/*
          **The art panel.** It is decorative — the mark already appears
          in the topbar wordmark — so it carries `aria-hidden` and its
          images carry empty `alt`s.
        */}
        <div className="landing__art" aria-hidden="true">
          {/*
            **The two variants are siblings, and CSS shows one of them.**
            The `data-theme-variant` attribute is the hook — the
            stylesheet hides the dark one in the light theme and the
            light one in the dark theme.
          */}
          <Image
            src="/brand/logo-mark-light.svg"
            alt=""
            width={220}
            height={220}
            data-theme-variant="light"
          />
          <Image
            src="/brand/logo-mark-dark.svg"
            alt=""
            width={220}
            height={220}
            data-theme-variant="dark"
          />
        </div>
      </section>

      <section className="landing__how" aria-labelledby="how-title">
        <h2 id="how-title" className="landing__how-title">
          {LANDING_HOW_TITLE}
        </h2>

        <div className="landing__how-grid">
          {LANDING_STEPS.map((step, index) => (
            <div className="landing__step" key={step.title}>
              {/*
                **The number is decorative.** The step's title names it,
                so a screen reader does not need to hear "1, Report".
              */}
              <div className="landing__step-num" aria-hidden="true">
                {index + 1}
              </div>

              <h3 className="landing__step-title">{step.title}</h3>

              <p className="landing__step-body">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
