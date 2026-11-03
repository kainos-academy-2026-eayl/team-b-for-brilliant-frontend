import { type Request, type Response, Router } from 'express';
import type { BasketItem } from '../models/basket';
import { BasketError, type BasketService } from '../services/basket';

// The backend identifies the customer from this token, not from the session's customerId
function getCredential(req: Request): string {
    if (!req.auth) throw new Error('Basket requires an authenticated customer');
    return req.auth.customerId;
}

function parseQuantity(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const quantity = Number(value);
    return Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
}

// Adds up in whole pence so decimal rounding errors can't creep into money
function calculateTotal(items: BasketItem[]): string {
    const pence = items.reduce(
        (sum, item) => sum + (item.lineTotal ? Math.round(Number(item.lineTotal) * 100) : 0),
        0,
    );
    return (pence / 100).toFixed(2);
}

// The backend rejected our token (expired, revoked or invalid), so the customer must sign in again
function signInAgain(req: Request, res: Response) {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect(`/login?returnTo=${encodeURIComponent('/basket')}&notice=expired`);
    });
}

export function createBasketRouter(basket: BasketService): Router {
    const router = Router();

    async function renderBasket(req: Request, res: Response, status = 200, error?: string) {
        try {
            const { items, notices } = await basket.getBasket(getCredential(req));
            res.status(status).render('basket.njk', { items, notices, total: calculateTotal(items), error });
        } catch (caught) {
            if (caught instanceof BasketError && caught.status === 401) {
                signInAgain(req, res);
                return;
            }
            console.error(caught);
            res.status(502).render('error.njk', {
                message: 'We could not load your basket right now. Please try again later.',
            });
        }
    }

    async function runAction(req: Request, res: Response, action: () => Promise<void>) {
        try {
            await action();
            res.redirect('/basket');
        } catch (caught) {
            if (caught instanceof BasketError && caught.status === 401) {
                signInAgain(req, res);
                return;
            }
            if (caught instanceof BasketError) {
                await renderBasket(req, res, caught.status, caught.message);
                return;
            }
            console.error(caught);
            res.status(502).render('error.njk', {
                message: 'We could not update your basket right now. Please try again later.',
            });
        }
    }

    router.get('/', (req, res) => {
        res.set('Cache-Control', 'no-store');
        return renderBasket(req, res);
    });

    router.post('/items', (req, res) => {
        const productID = String(req.body?.productID ?? '').trim();
        const quantity = parseQuantity(req.body?.quantity);
        if (!productID || quantity === null || quantity < 1) {
            return renderBasket(req, res, 400, 'Enter a quantity of 1 or more.');
        }
        return runAction(req, res, () => basket.addItem(getCredential(req), productID, quantity));
    });

    router.post('/items/:productID/update', (req, res) => {
        const quantity = parseQuantity(req.body?.quantity);
        if (quantity === null) {
            return renderBasket(req, res, 400, 'Enter a whole number, 0 or more.');
        }
        return runAction(req, res, () =>
            basket.setQuantity(getCredential(req), req.params.productID, quantity),
        );
    });

    router.post('/items/:productID/remove', (req, res) =>
        runAction(req, res, () => basket.removeItem(getCredential(req), req.params.productID)),
    );

    return router;
}
