"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

/**
 * Global single-slot modal.
 *
 * Pattern mirrors the toaster: module-level store + <ModalHost /> mounted once
 * in the dashboard layout. Callers anywhere use the imperative `modal` API:
 *
 *   modal.open({ title: "Edit", content: <Form />, size: "md" });
 *   modal.close();
 *
 * Only one modal is shown at a time — a second open() replaces the first.
 * Built on Radix Dialog so focus trap, ESC handling, backdrop click, a11y,
 * and portaling are all handled by the primitive.
 */

export type ModalSize = "sm" | "md" | "lg";

export interface ModalRequest {
  title: string;
  description?: string;
  content: ReactNode;
  size?: ModalSize;
  /** Fires after dismiss (ESC / backdrop / programmatic close). */
  onDismiss?: () => void;
}

type InternalState = (ModalRequest & { openCount: number }) | null;

let state: InternalState = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return null;
}

export const modal = {
  open(req: ModalRequest) {
    // openCount increments on every open so Radix Dialog treats each open as
    // a new dialog instance (prevents stale state / leftover portal)
    state = { ...req, openCount: (state?.openCount ?? 0) + 1 };
    notify();
  },
  close() {
    if (!state) return;
    const prev = state;
    state = null;
    notify();
    prev.onDismiss?.();
  },
};

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function ModalHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const open = current !== null;

  return (
    <Dialog.Root
      key={current?.openCount ?? 0}
      open={open}
      onOpenChange={(next) => {
        if (!next) modal.close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={[
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)]",
            SIZE_CLASS[current?.size ?? "md"],
            "panel p-6 outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          ].join(" ")}
        >
          {current && (
            <>
              <Dialog.Title className="text-base font-semibold text-text mb-1">
                {current.title}
              </Dialog.Title>
              {current.description ? (
                <Dialog.Description className="text-xs text-text-muted mb-4">
                  {current.description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  {current.title}
                </Dialog.Description>
              )}
              <div className="mt-2">{current.content}</div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
