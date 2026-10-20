import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function csrf(req: Request, res: Response, next: NextFunction): void {
	const expected = (req.session.csrfToken ??= randomBytes(32).toString("hex"));
	res.locals["csrfToken"] = expected;

	if (req.method === "POST") {
		const sent = String(req.body?._csrf ?? "");
		const ok =
			sent.length === expected.length &&
			timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
		if (!ok) {
			res.status(403).send("Invalid CSRF token");
			return;
		}
	}

	next();
}
