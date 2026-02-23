import { enableTunnel } from "@/lib/tunnel/tunnelManager";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const result = await enableTunnel();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tunnel enable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
