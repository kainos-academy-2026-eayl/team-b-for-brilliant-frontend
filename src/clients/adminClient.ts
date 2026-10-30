export type AdminVerifyResult =
    | { status: 'valid'; }
    | { status: 'invalid'; }
    | { status: 'locked'; };

export interface AdminClient {
    verifyCredentials(email: string, password: string): Promise<AdminVerifyResult>;
}

export function createAdminClient(baseUrl: string): AdminClient {
    return {
        async verifyCredentials(email, password) {
            const response = await fetch(`${baseUrl}/api/v1/auth/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) return { status: 'valid' };
            if (response.status === 401) return { status: 'invalid' };
            if (response.status === 429) return { status: 'locked' };
            throw new Error(`Admin service responded ${response.status}`);
        },
    };
}
