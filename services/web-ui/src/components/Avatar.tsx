import { useEffect, useState } from 'react';
import { fetchAvatarBlob, type Operator } from '../api/auth';

interface AvatarProps {
  operator: Operator;
  token: string;
  /** Diameter in pixels. */
  size?: number;
  /** Shows this image instead of the stored one, e.g. a photo being previewed before upload. */
  previewUrl?: string | null;
}

function initials(operator: Operator): string {
  const source = operator.displayName.trim() || operator.username;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The operator's photo, or their initials when there is none.
 *
 * <p>The image is private, so it is fetched with the session token and shown through an object URL;
 * it is fetched again only when {@code avatarUpdatedAt} changes.
 */
export function Avatar({ operator, token, size = 32, previewUrl }: AvatarProps) {
  const [url, setUrl] = useState<string | null>(null);
  const version = operator.avatarUpdatedAt ?? null;

  useEffect(() => {
    if (!version) {
      setUrl(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetchAvatarBlob(token, controller.signal)
      .then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        } else {
          setUrl(null);
        }
      })
      .catch(() => setUrl(null));
    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [token, version]);

  const shown = previewUrl ?? url;
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };

  return shown ? (
    <img
      src={shown}
      alt={`Photo de ${operator.displayName}`}
      className="flex-none rounded-full object-cover ring-1 ring-outline-variant"
      style={style}
    />
  ) : (
    <span
      className="flex flex-none select-none items-center justify-center rounded-full bg-primary-container font-semibold text-on-primary-container"
      style={style}
      aria-label={operator.displayName}
    >
      {initials(operator)}
    </span>
  );
}
