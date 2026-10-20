import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import pg from "pg";

const secret = process.env["SESSION_SECRET"];
if (!secret) {
	throw new Error("SESSION_SECRET environment variable is not set");
}

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
	store: new PgStore({
		pool: new pg.Pool({ connectionString: process.env["DATABASE_URL"] }),
		createTableIfMissing: true,
	}),
	secret,
	name: "sid",
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		secure: process.env["NODE_ENV"] === "production",
		sameSite: "lax",
		maxAge: 30 * 60 * 1000,
	},
});
