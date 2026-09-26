"use client";

import dynamic from "next/dynamic";

// Camera + MediaPipe: browser only.
const PoseLab = dynamic(() => import("@/components/poselab/PoseLab"), { ssr: false, loading: () => <div className="tool-page">LOADING POSE LAB...</div> });

export function PoseLabClient() {
  return <PoseLab />;
}
