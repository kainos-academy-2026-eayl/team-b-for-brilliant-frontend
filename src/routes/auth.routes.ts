import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
	postLogin,
	postLogout,
	showLogin,
} from "../controllers/auth.controller";
import { csrf } from "../middleware/csrf";
import { requireAuth } from "../middleware/require-auth";

// Second layer behind the per-account lockout; also covers unknown emails.
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	skipSuccessfulRequests: true,
});

export const authRouter = Router();

authRouter.use((_req, res, next) => {
	res.set("Cache-Control", "no-store");
	next();
});
authRouter.use(csrf);

authRouter.get("/login", showLogin);
authRouter.post("/login", loginLimiter, postLogin);
authRouter.post("/logout", postLogout);
authRouter.get("/forgot-password", (_req, res) => {
	res.render("forgot-password");
});
authRouter.get("/account", requireAuth, (req, res) => {
	res.render("account", { name: req.session.name });
});
