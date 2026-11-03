import { z } from 'zod';

const adminTokenSchema = z.object({
    accessToken: z.string().min(1),
    accessLevel: z.union([z.literal(0), z.literal(1)]),
});

export type AdminVerifyResult =
    | { status: 'valid'; accessToken: string; }
    | { status: 'invalid'; }
    | { status: 'locked'; };

export interface AdminClient {
    verifyCredentials(email: string, password: string): Promise<AdminVerifyResult>;
}

export function createAdminClient(baseUrl: string): AdminClient {
    return {
        async verifyCredentials(email, password) {
            const response = await fetch(`${baseUrl}/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const { accessToken, accessLevel } = adminTokenSchema.parse(await response.json());
                if (accessLevel !== 1) return { status: 'invalid' };
                return { status: 'valid', accessToken };
            }
            if (response.status === 401 || response.status === 404) return { status: 'invalid' };
            if (response.status === 429) return { status: 'locked' };
            throw new Error(`Admin service responded ${response.status}`);
        },
    };
}
