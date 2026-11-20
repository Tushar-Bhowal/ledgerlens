"use client";

import { createContext, useContext, type ReactNode } from "react";

export const StaticViewContext = createContext(true);

export function useStaticView() {
  return useContext(StaticViewContext);
}

export function StaticPreview({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return useStaticView() ? children : fallback;
}
