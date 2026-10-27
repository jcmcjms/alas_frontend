/** Decode a JWT payload without verifying it (verification is the server's job). */
export function decodeJwtPayload(
  token: string
): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    )
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
}

export interface TokenClaims {
  sub: string
  unique_name: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  email: string | null
  branchCode: string
  branchName: string
  role: string
  jobTitle: string | null
  permissions: string[]
  exp: number
}

/** Extract the session user from an access token; null when the token is unusable. */
export function extractUserFromToken(token: string): TokenClaims | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  if (typeof payload.sub !== "string" || typeof payload.role !== "string")
    return null
  return {
    sub: payload.sub,
    unique_name: String(payload.unique_name ?? ""),
    firstName: String(payload.firstName ?? ""),
    middleName: (payload.middleName as string | null) ?? null,
    lastName: String(payload.lastName ?? ""),
    suffix: (payload.suffix as string | null) ?? null,
    email: (payload.email as string | null) ?? null,
    branchCode: String(payload.branchCode ?? ""),
    branchName: String(payload.branchName ?? ""),
    role: payload.role,
    jobTitle: (payload.jobTitle as string | null) ?? null,
    permissions: Array.isArray(payload.permissions)
      ? (payload.permissions as string[])
      : [],
    exp: Number(payload.exp ?? 0),
  }
}
