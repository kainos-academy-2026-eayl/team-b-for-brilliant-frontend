import { type Request, type Response, Router } from 'express';
import { BasketError, type BasketService } from '../services/basket';

function getCredential(req: Request): string {
    return req.session.customerId ?? '';
}

function parseQuantity(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const quantity = Number(value);
    return Number.isInteger(quantity) && quantity >= 0 ? quantity : null;
}

export function createBasketRouter(basket: BasketService): Router {
    const router = Router();

    async function renderBasket(req: Request, res: Response, status = 200, error?: string) {
        try {
            const { items } = await basket.getBasket(getCredential(req));
            res.status(status).render('basket.njk', { items, error });
        } catch (caught) {
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
