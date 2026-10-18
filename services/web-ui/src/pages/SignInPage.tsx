import { useState, type FormEvent } from 'react';
import { register, signIn, type Session } from '../api/auth';
import { ApiError } from '../api/client';
import { Button, Field, TextInput } from '../components/Controls';

interface SignInPageProps {
  onSignedIn: (session: Session) => void;
  /** Shown above the form, e.g. when a stored session turned out to be expired. */
  notice?: string | null;
}

type Mode = 'signin' | 'register';

function describe(error: unknown): { message: string; fields: string[] } {
  if (error instanceof ApiError) {
    return { message: error.message, fields: error.fieldMessages() };
  }
  return {
    message: 'Impossible de joindre HyperGuard Sentinel. Le service est peut-être encore en cours de démarrage — réessayez dans un instant.',
    fields: [],
  };
}

export function SignInPage({ onSignedIn, notice }: SignInPageProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fields: string[] } | null>(null);

  const registering = mode === 'register';
  const canSubmit =
    username.trim() !== '' && password !== '' && (!registering || (displayName.trim() !== '' && password.length >= 8));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = registering
        ? await register({
            username: username.trim(),
            password,
            displayName: displayName.trim(),
            email: email.trim() || undefined,
          })
        : await signIn(username.trim(), password);
      onSignedIn(session);
    } catch (cause) {
      setError(describe(cause));
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-space-lg">
        <div className="flex items-center gap-space-sm">
          <img src="/logo/hyperguard-h-mark.svg" alt="" aria-hidden="true" className="h-10 w-10 flex-none" />
          <div>
            <p className="text-headline-sm font-semibold tracking-tight text-on-surface">HyperGuard Sentinel</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Console d’exploitation télémétrique</p>
          </div>
        </div>

        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <h1 className="font-display-lg text-display-lg font-semibold tracking-tight text-on-surface">
            {registering ? 'Créer votre compte' : 'Connexion'}
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {registering
              ? 'Votre nom et votre photo apparaissent dans l’en-tête de la console.'
              : 'Utilisez le compte que vous avez créé pour cette console.'}
          </p>

          {notice && !error ? (
            <p className="mt-space-md rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm text-on-surface" role="status">
              {notice}
            </p>
          ) : null}

          {error ? (
            <div className="mt-space-md rounded-lg border border-error-container bg-error-container/40 p-space-sm" role="alert">
              <p className="font-label-md text-label-md font-semibold text-on-error-container">{error.message}</p>
              {error.fields.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 font-body-sm text-body-sm text-on-error-container">
                  {error.fields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <form className="mt-space-lg flex flex-col gap-space-md" onSubmit={submit}>
            <Field label="Nom d’utilisateur" hint={registering ? '3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas' : undefined}>
              <TextInput id="username" value={username} autoComplete="username" onChange={setUsername} />
            </Field>

            {registering ? (
              <>
                <Field label="Nom complet">
                  <TextInput id="displayName" value={displayName} autoComplete="name" onChange={setDisplayName} />
                </Field>
                <Field label="E-mail" hint="Facultatif">
                  <TextInput id="email" type="email" value={email} autoComplete="email" onChange={setEmail} />
                </Field>
              </>
            ) : null}

            <Field label="Mot de passe" hint={registering ? 'Au moins 8 caractères' : undefined}>
              <TextInput
                id="password"
                type="password"
                value={password}
                autoComplete={registering ? 'new-password' : 'current-password'}
                invalid={registering && password !== '' && password.length < 8}
                onChange={setPassword}
              />
            </Field>

            <Button type="submit" variant="primary" size="large" disabled={!canSubmit || busy}>
              {busy ? (registering ? 'Création du compte…' : 'Connexion…') : registering ? 'Créer le compte' : 'Se connecter'}
            </Button>
          </form>
        </div>

        <p className="text-center font-body-md text-body-md text-on-surface-variant">
          {registering ? 'Vous avez déjà un compte ? ' : 'Première visite ? '}
          <button
            type="button"
            className="font-semibold text-primary underline-offset-2 hover:underline"
            onClick={() => switchMode(registering ? 'signin' : 'register')}
          >
            {registering ? 'Se connecter' : 'Créer un compte'}
          </button>
        </p>
      </div>
    </div>
  );
}
