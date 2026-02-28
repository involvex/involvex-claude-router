import console from "node:console";
export function formatOutput(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  return JSON.stringify(data, null, 2);
}

export function logError(message: string): void {
  console.error(`[ERROR] ${message}`);
}

export function logInfo(message: string): void {
  console.log(`[INFO] ${message}`);
}
