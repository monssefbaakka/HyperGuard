import { useEffect, useState } from 'react';

/** How long the curtain stays up before it starts lifting, and how long the lift itself takes. */
const HOLD_MS = 1500;
const FADE_MS = 520;

/**
 * Whether the curtain should be raised at all.
 *
 * <p>Callers check this *before* mounting {@link LogoReveal} rather than letting the component bow
 * out from an effect: mounting first would paint one full-screen dark frame, and a flash is the
 * precise thing `prefers-reduced-motion` is set to avoid.
 */
export function shouldRevealBrand(): boolean {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // Old browsers without matchMedia: treat it as "animation is fine".
    return true;
  }
}

/**
 * The brand curtain shown once, right after a successful sign-in.
 *
 * <p>The console is already mounted and loading behind this overlay, so the curtain covers the
 * moment the first screen would otherwise sit empty waiting for its API calls — it costs the
 * operator no time they were not already spending.
 *
 * <p>Honours `prefers-reduced-motion`: that setting skips the whole sequence rather than merely
 * slowing it, because the point of the reveal is the motion.
 */
export function LogoReveal({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const lift = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const done = window.setTimeout(onDone, HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      className={`logo-reveal ${leaving ? 'is-leaving' : ''}`}
      role="status"
      aria-label="Connecté. Ouverture de la console."
    >
      <div className="logo-reveal__halo" aria-hidden="true" />

      <div className="logo-reveal__stage">
        <img
          src="/logo/hyperguard-h-logo-dark.svg"
          alt=""
          className="logo-reveal__mark"
          width={1000}
          height={256}
        />
        <span className="logo-reveal__sweep" aria-hidden="true" />
      </div>

      <p className="logo-reveal__caption">Établissement de la liaison télémétrique sécurisée</p>
      <span className="logo-reveal__rail" aria-hidden="true">
        <span className="logo-reveal__rail-fill" />
      </span>
    </div>
  );
}
