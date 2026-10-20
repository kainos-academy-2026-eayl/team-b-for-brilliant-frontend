import { prisma } from "../db/prisma";
import { LOCK_DURATION_MS, MAX_FAILED_LOGINS } from "../config/auth";

export const customerRepository = {
	findByEmail: (email: string) =>
		prisma.customer.findUnique({ where: { email } }),

	async recordFailedLogin(id: string) {
		const { failedLoginCount } = await prisma.customer.update({
			where: { id },
			data: { failedLoginCount: { increment: 1 } },
			select: { failedLoginCount: true },
		});

		if (failedLoginCount >= MAX_FAILED_LOGINS) {
			await prisma.customer.update({
				where: { id },
				data: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
			});
		}
	},

	resetFailedLogins: (id: string) =>
		prisma.customer.update({
			where: { id },
			data: { failedLoginCount: 0, lockedUntil: null },
		}),
};
