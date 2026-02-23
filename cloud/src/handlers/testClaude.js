/**
 * Test Claude handler - forwards request directly to Anthropic API
 * Used to verify a Claude API key works correctly.
 */
export async function handleTestClaude(request) {
  try {
    const body = await request.json();

    const authHeader = request.headers.get("Authorization") || "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        "anthropic-version": "2023-06-01",
        "x-api-key": authHeader.replace(/^Bearer\s+/i, ""),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
