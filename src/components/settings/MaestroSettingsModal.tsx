import { invoke } from "@tauri-apps/api/core";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface MaestroSettingsModalProps {
  onClose: () => void;
}

export function MaestroSettingsModal({ onClose }: MaestroSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("get_app_version")
      .then(setAppVersion)
      .catch((err) => console.error("Failed to get app version:", err));
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-lg border border-maestro-border bg-maestro-bg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-maestro-border px-4 py-3">
          <h2 className="text-sm font-semibold text-maestro-text">Maestro Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-maestro-border/40"
          >
            <X size={16} className="text-maestro-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-4">
          {/* Version */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-maestro-muted">
              Version
            </div>
            <div className="flex items-center gap-2 px-1 text-xs">
              <Check size={12} className="shrink-0 text-maestro-green" />
              <span className="text-maestro-text font-medium">
                v{appVersion ?? "..."}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
