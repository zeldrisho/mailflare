"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { clsx } from "cn";

type SwipeAction = {
  label: string;
  icon: LucideIcon;
  className: string;
  onTrigger: () => void;
};

type SwipeableRowProps = {
  children: ReactNode;
  // Revealed when dragging left to right.
  startAction: SwipeAction;
  // Revealed when dragging right to left.
  endAction: SwipeAction;
  disabled?: boolean;
};

const COMMIT_DISTANCE = 88;

const INTENT_DISTANCE = 10;

// Touch-only swipe gestures; vertical scrolling stays with the browser via touch-action: pan-y.
export function SwipeableRow({ children, startAction, endAction, disabled }: SwipeableRowProps) {
  const [dragging, setDragging] = useState(false);
  const [direction, setDirection] = useState<"start" | "end" | null>(null);
  const [armed, setArmed] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; active: boolean; id: number } | null>(null);
  const swiped = useRef(false);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.pointerType === "mouse") return;
    gesture.current = { x: event.clientX, y: event.clientY, active: false, id: event.pointerId };
    swiped.current = false;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;

    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;

    if (!current.active) {
      if (Math.abs(dy) > INTENT_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
        gesture.current = null;

        return;
      }

      if (Math.abs(dx) < INTENT_DISTANCE) return;
      current.active = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    // Pointer events can fire more often than the display refresh rate. Update the
    // transform directly so dragging does not re-render the whole message row.
    if (rowRef.current) rowRef.current.style.transform = `translateX(${dx}px)`;
    const nextDirection = dx > 0 ? "start" : "end";

    if (nextDirection !== direction) setDirection(nextDirection);
    const nextArmed = Math.abs(dx) >= COMMIT_DISTANCE;

    if (nextArmed !== armed) setArmed(nextArmed);
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;

    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;

    if (!current.active) return;
    swiped.current = true;
    setDragging(false);
    setDirection(null);
    setArmed(false);

    if (rowRef.current) rowRef.current.style.transform = "";
    const dx = event.clientX - current.x;

    if (event.type !== "pointercancel") {
      if (dx >= COMMIT_DISTANCE) startAction.onTrigger();
      else if (dx <= -COMMIT_DISTANCE) endAction.onTrigger();
    }
  }

  const action = direction === "start" ? startAction : direction === "end" ? endAction : null;
  const Icon = action?.icon;

  return (
    <div className="relative overflow-hidden">
      {action && Icon && (
        <div
          aria-hidden="true"
          className={clsx(
            "absolute inset-0 flex items-center px-6 text-white",
            direction === "start" ? "justify-start" : "justify-end",
            action.className,
          )}
        >
          <span
            className={clsx(
              "flex items-center gap-2 text-sm font-medium transition-transform",
              armed && "scale-110",
            )}
          >
            <Icon className="h-5 w-5" />
            {action.label}
          </span>
        </div>
      )}
      <div
        ref={rowRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(event) => {
          if (!swiped.current) return;
          swiped.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        className={clsx(
          "relative bg-white",
          !dragging && "transition-transform duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}
