import { useNavStore } from './useNavStore';
import { clearCachedTheme } from './useTheme';

/** Ends the session and forgets everything this browser kept for the person (tabs, favorites, theme). */
export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  useNavStore.persist.clearStorage();
  try { localStorage.removeItem('md-reader-favorites'); } catch { /* storage blocked */ }
  clearCachedTheme();
  // Full reload so the next session starts with empty query caches and the default theme.
  window.location.replace('/login');
}
