const DEFAULT_PATH = "/account";

export function safeReturnTo(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_PATH;
	if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_PATH;
	if (/[\\\r\n\t]/.test(value)) return DEFAULT_PATH;
	return value;
}
