"use client";

import dynamic from "next/dynamic";

const PoseEditor = dynamic(() => import("@/components/editor/PoseEditor"), { ssr: false, loading: () => <div className="tool-page">LOADING EDITOR...</div> });

export function PoseEditorClient() {
  return <PoseEditor />;
}
