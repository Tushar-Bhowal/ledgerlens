"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { inCrore, money } from "@/lib/demo-data";

export type CountFormat = "integer" | "rupees" | "crore" | "percent";

const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-IN", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatCount(value: number, format: CountFormat) {
  switch (format) {
    case "crore": return inCrore(value);
    case "rupees": return money(value);
    case "percent": return percent.format(value);
    default: return integer.format(value);
  }
}

export function CountUp({ value, format = "integer", initialOnly = false }: { value: number; format?: CountFormat; initialOnly?: boolean }) {
  const reducedMotion = useReducedMotion();
  const initialValue = useRef(value);
  const hasChanged = useRef(false);
  const counter = useMotionValue(value);
  const displayed = useTransform(counter, (amount) => formatCount(amount, format));

  useEffect(() => {
    if (value !== initialValue.current) hasChanged.current = true;
    if (reducedMotion || value === 0 || (initialOnly && hasChanged.current)) {
      counter.set(value);
      return;
    }

    counter.set(0);
    const animation = animate(counter, value, { duration: 0.7, ease: "easeOut" });
    return () => animation.stop();
  }, [counter, initialOnly, reducedMotion, value]);

  return (
    <>
      <span className="sr-only">{formatCount(value, format)}</span>
      <motion.span aria-hidden="true">{displayed}</motion.span>
    </>
  );
}
