"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNewerBuild } from "@/lib/app-version";

const POLL_MS = 60_000;
const BANNER_HEIGHT_VAR = "--app-update-banner-height";

type Shortcut = {
  keys: string[];
  label: string;
};

const APPLE_SHORTCUT: Shortcut = {
  keys: ["⌘", "⇧", "R"],
  label: "Comando Shift R",
};
const OTHER_SHORTCUT: Shortcut = {
  keys: ["Ctrl", "Shift", "R"],
  label: "Control Shift R",
};

function subscribeToBrowser() {
  return () => {};
}

function detectShortcut(): Shortcut {
  const apple = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return apple ? APPLE_SHORTCUT : OTHER_SHORTCUT;
}

function readPreviewUpdate(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  return (
    new URLSearchParams(window.location.search).get("preview-update") === "1"
  );
}

export function AppUpdateBanner({ buildId }: { buildId: string }) {
  // Se conserva el id con el que se abrió la pestaña. Si el layout se
  // revalida contra el deploy nuevo, las props cambian pero esta pestaña
  // sigue ejecutando el bundle anterior.
  const [loadedBuildId] = useState(buildId);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [remoteUpdate, setRemoteUpdate] = useState(false);
  const [reloading, setReloading] = useState(false);
  const shortcut = useSyncExternalStore(
    subscribeToBrowser,
    detectShortcut,
    () => APPLE_SHORTCUT,
  );
  const previewUpdate = useSyncExternalStore(
    subscribeToBrowser,
    readPreviewUpdate,
    () => false,
  );
  const updateAvailable = remoteUpdate || previewUpdate;

  useEffect(() => {
    if (loadedBuildId === "development") return;

    let cancelled = false;

    async function check() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { buildId?: unknown };
        if (
          !cancelled &&
          typeof data.buildId === "string" &&
          isNewerBuild(loadedBuildId, data.buildId)
        ) {
          setRemoteUpdate(true);
        }
      } catch {
        // Sin red se reintenta en el próximo ciclo o al volver a la pestaña.
      }
    }

    void check();
    const timer = window.setInterval(() => {
      void check();
    }, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadedBuildId]);

  useLayoutEffect(() => {
    const element = bannerRef.current;
    if (!updateAvailable || !element) {
      document.documentElement.style.removeProperty(BANNER_HEIGHT_VAR);
      return;
    }

    const applyHeight = () => {
      document.documentElement.style.setProperty(
        BANNER_HEIGHT_VAR,
        `${element.offsetHeight}px`,
      );
    };

    applyHeight();
    const observer = new ResizeObserver(applyHeight);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(BANNER_HEIGHT_VAR);
    };
  }, [updateAvailable]);

  if (!updateAvailable) return null;

  return (
    <div
      ref={bannerRef}
      role="status"
      aria-live="polite"
      className="bg-primary text-primary-foreground sticky top-0 z-[60] flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2 text-sm"
    >
      <p className="text-center leading-snug">
        Hay una nueva versión. Apretá{" "}
        <span className="font-semibold">Recargar ahora</span>, o usá{" "}
        <span className="inline-flex items-center gap-1 align-middle">
          <span className="sr-only">{shortcut.label}</span>
          {shortcut.keys.map((key) => (
            <kbd
              key={key}
              aria-hidden
              className="border-primary-foreground/30 bg-primary-foreground/15 rounded-md border px-1.5 py-0.5 font-sans text-xs font-semibold"
            >
              {key}
            </kbd>
          ))}
        </span>{" "}
        para actualizar.
      </p>
      <Button
        type="button"
        size="sm"
        disabled={reloading}
        className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
        onClick={() => {
          setReloading(true);
          window.location.reload();
        }}
      >
        <RefreshCwIcon />
        {reloading ? "Recargando…" : "Recargar ahora"}
      </Button>
    </div>
  );
}
