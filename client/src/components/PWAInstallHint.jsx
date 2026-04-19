import { useEffect, useState } from 'react';

const DISMISS_KEY = 'pwa:installHintDismissed';
const IOS_RE = /iPhone|iPad|iPod/i;

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * Shows an "Install ClubCatan" affordance:
 *
 *  - Android/Chromium: captures `beforeinstallprompt`, renders a primary
 *    button that calls `event.prompt()`.
 *  - iOS Safari: no `beforeinstallprompt` exists. We UA-sniff and render
 *    a tooltip showing how to use the Share sheet -> "Add to Home Screen".
 *
 * Dismiss is sticky (localStorage). Hidden entirely once the app is running
 * standalone.
 */
export default function PWAInstallHint() {
  const [prompt, setPrompt] = useState(null); // BeforeInstallPromptEvent | null
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [standalone, setStandalone] = useState(() => {
    try { return isStandalone(); } catch { return false; }
  });

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => {
      setPrompt(null);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone || dismissed) return null;

  const isIOS = IOS_RE.test(navigator.userAgent) && !window.MSStream;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setDismissed(true);
  };

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    try { await prompt.userChoice; } catch {}
    setPrompt(null);
  };

  if (prompt) {
    return (
      <InstallCard
        title="Install ClubCatan"
        body="Add it to your home screen for full-screen, offline-ready play."
        primary={{ label: 'Install', onClick: install }}
        onDismiss={dismiss}
      />
    );
  }

  if (isIOS) {
    return (
      <InstallCard
        title="Add ClubCatan to your Home Screen"
        body={
          <>
            Tap <ShareIcon /> <b>Share</b> in Safari, then choose{' '}
            <b>"Add to Home Screen"</b>. Launches full-screen, no tab chrome.
          </>
        }
        onDismiss={dismiss}
      />
    );
  }

  return null;
}

function InstallCard({ title, body, primary, onDismiss }) {
  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl bg-surface/92 backdrop-blur-xl shadow-ambient ring-1 ring-outline-variant/60 p-4 flex items-start gap-3"
    >
      <div className="flex-1 min-w-0">
        <h2 id="pwa-install-title" className="text-sm font-semibold text-on-surface">
          {title}
        </h2>
        <p className="text-sm text-on-surface-variant mt-1 leading-snug">{body}</p>
        {primary && (
          <button
            type="button"
            onClick={primary.onClick}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-primary text-surface px-4 py-1.5 text-sm font-semibold hover:bg-primary-container transition-colors"
          >
            {primary.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="shrink-0 rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6l-12 12"/>
        </svg>
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      className="inline-block align-text-bottom mx-0.5"
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M12 3v13" />
      <path d="M7 8l5-5 5 5" />
      <rect x="4" y="14" width="16" height="7" rx="2" />
    </svg>
  );
}
