const normalizeOrigin = (origin: string): string =>
  origin.trim().replace(/\/+$/, "")

const getAllowedOrigins = (): string[] =>
  (process.env.ALLOW_ORIGIN || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean)

export const allowConfiguredOrigin = (
  origin: string | undefined,
  callback: (error: Error | null, allowed?: boolean) => void
): void => {
  // Requests without Origin are not browser cross-origin requests (for example
  // health checks and server-to-server calls), so CORS does not apply to them.
  if (!origin) {
    callback(null, true)
    return
  }

  if (getAllowedOrigins().includes(normalizeOrigin(origin))) {
    callback(null, true)
    return
  }

  callback(new Error("Origin is not allowed by CORS"))
}

export const getCorsOptions = () => ({
  origin: allowConfiguredOrigin,
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"]
})
