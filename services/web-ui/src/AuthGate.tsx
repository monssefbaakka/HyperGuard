import { useCallback, useEffect, useState } from 'react';
import { fetchMe, loadStoredSession, signOut, storeSession, type Operator, type Session } from './api/auth';
import { ApiError, onApiSessionEnded, setApiSession } from './api/client';
import App from './App';
import { LogoReveal, shouldRevealBrand } from './components/LogoReveal';
import { SignInPage } from './pages/SignInPage';

type GateState =
  | { kind: 'checking'; session: Session }
  | { kind: 'signedOut'; notice: string | null }
  | { kind: 'signedIn'; session: Session };

/**
 * Keeps the console behind a sign-in.
 *
 * <p>A session remembered from a previous visit is confirmed with the server before the console
 * opens, so a revoked or expired token lands on the sign-in form instead of a half-working console.
 */
export function AuthGate() {
  const [state, setState] = useState<GateState>(() => {
    const stored = loadStoredSession();
    return stored ? { kind: 'checking', session: stored } : { kind: 'signedOut', notice: null };
  });

  /*
   * The API client carries the token for every call. It is set during render, not in an effect: the
   * console's own loaders run in child effects, which fire before a parent effect would.
   */
  setApiSession(state.kind === 'signedIn' ? state.session.token : null);

  useEffect(() => {
    onApiSessionEnded(() => {
      storeSession(null);
      setState({ kind: 'signedOut', notice: 'Votre session a expiré. Reconnectez-vous pour continuer.' });
    });
    return () => onApiSessionEnded(null);
  }, []);

  useEffect(() => {
    if (state.kind !== 'checking') {
      return;
    }
    const controller = new AbortController();
    const { session } = state;
    fetchMe(session.token, controller.signal)
      .then((operator) => {
        const refreshed = { ...session, operator };
        storeSession(refreshed);
        setState({ kind: 'signedIn', session: refreshed });
      })
      .catch((cause) => {
        if (controller.signal.aborted) {
          return;
        }
        if (cause instanceof ApiError && cause.status === 401) {
          storeSession(null);
          setState({ kind: 'signedOut', notice: 'Votre session a expiré. Reconnectez-vous pour continuer.' });
        } else {
          // Server unreachable: open the console with what we know; its own banners report the outage.
          setState({ kind: 'signedIn', session });
        }
      });
    return () => controller.abort();
  }, [state]);

  /*
   * Only a sign-in the operator just performed raises the brand curtain. A session restored from a
   * previous visit opens the console straight away — a reveal on every page reload would be a toll,
   * not a welcome — and a reduced-motion preference skips it without ever mounting it.
   */
  const [revealing, setRevealing] = useState(false);
  const endReveal = useCallback(() => setRevealing(false), []);

  const handleSignedIn = useCallback((session: Session) => {
    storeSession(session);
    setState({ kind: 'signedIn', session });
    setRevealing(shouldRevealBrand());
  }, []);

  const handleOperatorChange = useCallback((operator: Operator) => {
    setState((current) => {
      if (current.kind !== 'signedIn') {
        return current;
      }
      const session = { ...current.session, operator };
      storeSession(session);
      return { kind: 'signedIn', session };
    });
  }, []);

  const signedInToken = state.kind === 'signedIn' ? state.session.token : null;
  const handleSignOut = useCallback(() => {
    if (signedInToken) {
      // Revoke server-side too; the local sign-out does not wait for it.
      void signOut(signedInToken).catch(() => undefined);
    }
    storeSession(null);
    setState({ kind: 'signedOut', notice: 'Vous êtes déconnecté.' });
  }, [signedInToken]);

  if (state.kind === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary"
          role="status"
          aria-label="Vérification de votre session"
        />
      </div>
    );
  }

  if (state.kind === 'signedOut') {
    return <SignInPage onSignedIn={handleSignedIn} notice={state.notice} />;
  }

  /*
   * The console mounts underneath the curtain rather than after it, so its first screen spends the
   * reveal loading instead of leaving the operator on an empty layout once the curtain lifts.
   */
  return (
    <>
      <App
        operator={state.session.operator}
        token={state.session.token}
        onOperatorChange={handleOperatorChange}
        onSignOut={handleSignOut}
      />
      {revealing ? <LogoReveal onDone={endReveal} /> : null}
    </>
  );
}
