import initializeApp from "@/shared/services/initializeApp";

let initialized = false;

export async function ensureAppInitialized() {
  // Never initialize during build or on client side
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    typeof window !== "undefined"
  ) {
    return false;
  }

  if (!initialized) {
    try {
      await initializeApp();
      initialized = true;
    } catch (error) {
      console.error("[ServerInit] Error initializing app:", error);
    }
  }
  return initialized;
}

// Auto-initialize when module loads (only in server runtime, not during build)
if (
  process.env.NEXT_PHASE !== "phase-production-build" &&
  typeof window === "undefined"
) {
  ensureAppInitialized().catch(console.log);
}

export default ensureAppInitialized;
