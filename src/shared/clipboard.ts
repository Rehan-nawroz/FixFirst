/**
 * Clipboard helper with a safe fallback. Only ever writes text the user
 * explicitly asked to copy; never executes or mutates anything.
 */
export type WriteText = (text: string) => Promise<void>;

async function defaultWrite(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('no-clipboard');
}

export async function copyText(
  text: string,
  write: WriteText = defaultWrite,
): Promise<boolean> {
  try {
    await write(text);
    return true;
  } catch {
    // Fallback for contexts without the async clipboard API.
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
