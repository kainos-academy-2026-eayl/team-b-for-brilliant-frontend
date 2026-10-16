import 'dotenv/config';
import argon2 from 'argon2';
import { prisma } from '../src/db/prisma';

await prisma.customer.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
        email: 'test@example.com',
        name: 'Test Customer',
        passwordHash: await argon2.hash('Password123!'),
    },
});

await prisma.$disconnect();
