/**
 * Recursively redact sensitive fields from objects before logging.
 *
 * Matches keys (case-insensitive, substring) against common patterns:
 * - authorization
 * - api_key / apikey / api-key
 * - access_token / accesstoken
 * - refresh_token / refreshtoken
 * - secret
 * - password
 * - credential
 *
 * @param {*} obj - The object/value to sanitize
 * @param {WeakSet} [seen] - Internal cycle detection
 * @returns {*} Sanitized copy of the input
 */
const SENSITIVE_PATTERNS = [
  /auth/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
];

export function sanitizeForLog(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Avoid circular references
  if (seen.has(obj)) {
    return "[circular]";
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLog(item, seen));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
    if (isSensitive) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeForLog(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Sanitize a string that may contain API keys or tokens (e.g., URLs with embedded credentials).
 * Replaces anything that looks like a Bearer token or API key in a URL.
 *
 * @param {string} str - String that may contain secrets
 * @returns {string} Sanitized string
 */
export function sanitizeString(str) {
  if (!str || typeof str !== "string") return str;
  return str
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, "Bearer [REDACTED]")
    .replace(/(key|token|secret)=[A-Za-z0-9\-_\.]+/gi, "$1=[REDACTED]")
    .replace(/(sk-[A-Za-z0-9\-_]+)/gi, "sk-[REDACTED]");
}
