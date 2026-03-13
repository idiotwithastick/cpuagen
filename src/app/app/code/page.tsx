"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Code page — redirects to unified workspace at /app/chat
 * v15.0: Code functionality is now integrated into the Chat workspace
 * via the ArtifactPanel and layout mode system.
 */
export default function CodeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/chat");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-background text-muted text-sm font-mono">
      Redirecting to Workspace...
    </div>
  );
}
