import argon2 from 'argon2';
import { customerRepository } from './customer.repository';

// Verified against when the email is unknown so response time doesn't reveal it.
const DUMMY_HASH = await argon2.hash('not-a-real-password');

export type LoginResult =
    | { status: 'ok'; customer: { id: string; name: string; }; }
    | { status: 'invalid'; }
    | { status: 'locked'; };

export async function authenticate(email: string, password: string): Promise<LoginResult> {
    const customer = await customerRepository.findByEmail(email);

    if (!customer) {
        await argon2.verify(DUMMY_HASH, password);
        return { status: 'invalid' };
    }

    if (customer.lockedUntil) {
        if (customer.lockedUntil > new Date()) return { status: 'locked' };
        await customerRepository.resetFailedLogins(customer.id);
    }

    if (!(await argon2.verify(customer.passwordHash, password))) {
        await customerRepository.recordFailedLogin(customer.id);
        return { status: 'invalid' };
    }

    await customerRepository.resetFailedLogins(customer.id);
    return { status: 'ok', customer: { id: customer.id, name: customer.name } };
}
