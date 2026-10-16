import argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./customer.repository', () => ({
    customerRepository: {
        findByEmail: vi.fn(),
        recordFailedLogin: vi.fn(),
        resetFailedLogins: vi.fn(),
    },
}));

import { authenticate } from './auth.service';
import { customerRepository as repo } from './customer.repository';

const customer = {
    id: '1',
    name: 'Test',
    email: 'a@b.com',
    passwordHash: await argon2.hash('Password123!'),
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
};

describe('authenticate', () => {
    beforeEach(() => vi.resetAllMocks());

    it('signs in with valid credentials and resets the failure count', async () => {
        vi.mocked(repo.findByEmail).mockResolvedValue(customer);
        const result = await authenticate('a@b.com', 'Password123!');
        expect(result).toEqual({ status: 'ok', customer: { id: '1', name: 'Test' } });
        expect(repo.resetFailedLogins).toHaveBeenCalledWith('1');
    });

    it('gives the same result for a wrong password and an unknown email', async () => {
        vi.mocked(repo.findByEmail).mockResolvedValueOnce(customer);
        const wrongPassword = await authenticate('a@b.com', 'nope');
        vi.mocked(repo.findByEmail).mockResolvedValueOnce(null);
        const unknownEmail = await authenticate('x@y.com', 'nope');
        expect(wrongPassword).toEqual({ status: 'invalid' });
        expect(unknownEmail).toEqual(wrongPassword);
    });

    it('records a failed attempt on a wrong password', async () => {
        vi.mocked(repo.findByEmail).mockResolvedValue(customer);
        await authenticate('a@b.com', 'nope');
        expect(repo.recordFailedLogin).toHaveBeenCalledWith('1');
    });

    it('refuses a locked account even with the right password', async () => {
        vi.mocked(repo.findByEmail).mockResolvedValue({ ...customer, lockedUntil: new Date(Date.now() + 60_000) });
        const result = await authenticate('a@b.com', 'Password123!');
        expect(result).toEqual({ status: 'locked' });
        expect(repo.recordFailedLogin).not.toHaveBeenCalled();
    });

    it('allows sign-in again once the lock has expired', async () => {
        vi.mocked(repo.findByEmail).mockResolvedValue({ ...customer, lockedUntil: new Date(Date.now() - 1000) });
        const result = await authenticate('a@b.com', 'Password123!');
        expect(result.status).toBe('ok');
    });
});
