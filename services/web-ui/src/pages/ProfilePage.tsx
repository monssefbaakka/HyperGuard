import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { changePassword, removeAvatar, updateProfile, uploadAvatar, type Operator } from '../api/auth';
import { ApiError } from '../api/client';
import { Avatar } from '../components/Avatar';
import { Button, Field, TextInput } from '../components/Controls';
import { formatInstant } from '../components/format';

interface ProfilePageProps {
  operator: Operator;
  token: string;
  onOperatorChange: (operator: Operator) => void;
  onSignOut: () => void;
}

/** Longest side of the stored photo. Big enough for a retina header chip, small enough to upload instantly. */
const PHOTO_SIZE = 320;
/** Raw files above this are refused before decoding, so a huge camera RAW does not freeze the tab. */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

type Status = { kind: 'ok' | 'error'; message: string } | null;

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = error.fieldMessages();
    return fields.length > 0 ? `${error.message} ${fields.join(' · ')}` : error.message;
  }
  return 'Impossible de joindre HyperGuard Sentinel. Réessayez dans un instant.';
}

/** Centre-crops the picture to a square and re-encodes it as JPEG, so what is uploaded is small and uniform. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const target = Math.min(PHOTO_SIZE, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas n’est pas disponible dans ce navigateur.');
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    target,
    target,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('L’image n’a pas pu être encodée.'))), 'image/jpeg', 0.9),
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) {
    return null;
  }
  return (
    <p
      role={status.kind === 'error' ? 'alert' : 'status'}
      className={`font-body-sm text-body-sm ${status.kind === 'error' ? 'text-error' : 'text-secondary'}`}
    >
      {status.message}
    </p>
  );
}

export function ProfilePage({ operator, token, onOperatorChange, onSignOut }: ProfilePageProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<Status>(null);

  const [displayName, setDisplayName] = useState(operator.displayName);
  const [email, setEmail] = useState(operator.email ?? '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState<Status>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);

  const profileDirty = displayName.trim() !== operator.displayName || email.trim() !== (operator.email ?? '');

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setPhotoStatus({ kind: 'error', message: 'Choisissez un fichier image (PNG, JPEG, WebP…).' });
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setPhotoStatus({ kind: 'error', message: 'Ce fichier dépasse 15 Mo. Choisissez une photo plus légère.' });
      return;
    }

    setPhotoBusy(true);
    setPhotoStatus(null);
    let localUrl: string | null = null;
    try {
      const square = await toSquareJpeg(file);
      localUrl = URL.createObjectURL(square);
      setPreview(localUrl);
      const updated = await uploadAvatar(token, square, 'avatar.jpg');
      onOperatorChange(updated);
      setPhotoStatus({ kind: 'ok', message: 'Photo mise à jour.' });
    } catch (cause) {
      setPhotoStatus({
        kind: 'error',
        message: cause instanceof ApiError ? messageOf(cause) : 'Cette image n’a pas pu être lue. Essayez un autre fichier.',
      });
    } finally {
      setPreview(null);
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }
      setPhotoBusy(false);
    }
  };

  const deletePhoto = async () => {
    setPhotoBusy(true);
    setPhotoStatus(null);
    try {
      onOperatorChange(await removeAvatar(token));
      setPhotoStatus({ kind: 'ok', message: 'Photo supprimée.' });
    } catch (cause) {
      setPhotoStatus({ kind: 'error', message: messageOf(cause) });
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileStatus(null);
    try {
      const updated = await updateProfile(token, { displayName: displayName.trim(), email: email.trim() || undefined });
      onOperatorChange(updated);
      setDisplayName(updated.displayName);
      setEmail(updated.email ?? '');
      setProfileStatus({ kind: 'ok', message: 'Profil enregistré.' });
    } catch (cause) {
      setProfileStatus({ kind: 'error', message: messageOf(cause) });
    } finally {
      setProfileBusy(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordStatus(null);
    try {
      await changePassword(token, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordStatus({ kind: 'ok', message: 'Mot de passe modifié.' });
    } catch (cause) {
      setPasswordStatus({ kind: 'error', message: messageOf(cause) });
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
        <div className="flex items-center gap-space-xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          <span>HyperGuard</span>
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
            chevron_right
          </span>
          <span className="font-medium text-primary">Mon profil</span>
        </div>
        <div className="mt-space-md flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex min-w-0 items-center gap-space-md">
            <Avatar operator={operator} token={token} size={72} previewUrl={preview} />
            <div className="min-w-0">
              <h2 className="truncate font-display-lg text-display-lg font-semibold tracking-tight text-on-surface">
                {operator.displayName}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                <span className="font-mono text-code-sm">@{operator.username}</span>
                {' · membre depuis le '}
                {formatInstant(operator.createdAt)}
              </p>
            </div>
          </div>
          <Button onClick={onSignOut}>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              logout
            </span>
            Se déconnecter
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-lg xl:grid-cols-12 xl:items-start">
        <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm xl:col-span-4">
          <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Photo de profil</h3>
          <div className="flex items-center gap-space-md">
            <Avatar operator={operator} token={token} size={112} previewUrl={preview} />
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              L’image est recadrée en carré et redimensionnée avant l’envoi. Vous seul la voyez, dans l’en-tête de
              votre console.
            </p>
          </div>
          <input
            ref={fileInput}
            id="avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*"
            className="sr-only"
            onChange={choosePhoto}
          />
          <div className="flex flex-wrap gap-space-sm">
            <Button variant="primary" disabled={photoBusy} onClick={() => fileInput.current?.click()}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                add_a_photo
              </span>
              {photoBusy ? 'Envoi…' : operator.avatarUpdatedAt ? 'Changer la photo' : 'Ajouter une photo'}
            </Button>
            {operator.avatarUpdatedAt ? (
              <Button variant="quiet" disabled={photoBusy} onClick={deletePhoto}>
                Supprimer
              </Button>
            ) : null}
          </div>
          <StatusLine status={photoStatus} />
        </section>

        <form
          className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm xl:col-span-4"
          onSubmit={saveProfile}
        >
          <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Vos informations</h3>
          <div className="flex flex-col gap-1.5">
            <span className="font-label-md text-label-md font-medium text-on-surface-variant">Nom d’utilisateur</span>
            <span className="flex h-10 items-center rounded-lg bg-surface-container-low px-3 font-mono text-code-sm text-on-surface">
              {operator.username}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">Sert à la connexion ; il ne peut pas être modifié</span>
          </div>
          <Field label="Nom complet">
            <TextInput id="profile-name" value={displayName} autoComplete="name" onChange={setDisplayName} />
          </Field>
          <Field label="E-mail" hint="Facultatif">
            <TextInput id="profile-email" type="email" value={email} autoComplete="email" onChange={setEmail} />
          </Field>
          <div className="flex items-center gap-space-md">
            <Button type="submit" variant="primary" disabled={!profileDirty || !displayName.trim() || profileBusy}>
              {profileBusy ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </Button>
            <StatusLine status={profileStatus} />
          </div>
        </form>

        <form
          className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm xl:col-span-4"
          onSubmit={savePassword}
        >
          <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Mot de passe</h3>
          <Field label="Mot de passe actuel">
            <TextInput
              id="current-password"
              type="password"
              value={currentPassword}
              autoComplete="current-password"
              onChange={setCurrentPassword}
            />
          </Field>
          <Field label="Nouveau mot de passe" hint="Au moins 8 caractères">
            <TextInput
              id="new-password"
              type="password"
              value={newPassword}
              autoComplete="new-password"
              invalid={newPassword !== '' && newPassword.length < 8}
              onChange={setNewPassword}
            />
          </Field>
          <div className="flex items-center gap-space-md">
            <Button
              type="submit"
              variant="primary"
              disabled={!currentPassword || newPassword.length < 8 || passwordBusy}
            >
              {passwordBusy ? 'Modification…' : 'Changer le mot de passe'}
            </Button>
            <StatusLine status={passwordStatus} />
          </div>
        </form>
      </div>
    </div>
  );
}
