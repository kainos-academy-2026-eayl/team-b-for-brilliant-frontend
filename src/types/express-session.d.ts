import "express-session";

declare module "express-session" {
	interface SessionData {
		customerId: string;
		name: string;
		csrfToken: string;
	}
}
