import { apiErrorMessage } from './errors';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    signal,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(
      response.status,
      apiErrorMessage(payload.error || response.statusText, response.status),
    );
  }
  return payload as T;
}
export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    /* HTTP deployments need a fallback. */
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    input.remove();
  }
}
export async function base64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
export function iconName(prefix: string, slug: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'icon';
  let head = normalize(prefix);
  if (!/^[a-z]/.test(head)) head = `p-${head}`;
  head = head.slice(0, 40);
  let tail = normalize(slug);
  if (tail.startsWith(`${head}-`)) tail = tail.slice(head.length + 1);
  if (tail === head) tail = 'icon';
  return `${head}-${tail || 'icon'}`;
}
