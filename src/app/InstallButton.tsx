"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // iOS detection
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
    setIsIOS(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSHint(true);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  };

  if (isInstalled) return null;
  if (!installPrompt && !isIOS) return null;

  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-3">
      <button
        onClick={handleInstall}
        className="w-full rounded-2xl bg-indigo-600 px-6 py-4 text-white text-lg font-bold shadow-lg active:scale-[0.97] transition flex items-center justify-center gap-2"
      >
        <span>⬇️</span> Install ClassGate App
      </button>
      <p className="text-xs text-slate-400">Free · Works offline · No app store needed</p>

      {showIOSHint && (
        <div className="rounded-xl bg-slate-100 border border-slate-200 p-4 text-sm text-slate-700 text-left">
          Tap the <strong>Share</strong> button in Safari, then select{" "}
          <strong>"Add to Home Screen"</strong>
        </div>
      )}
    </div>
  );
}
