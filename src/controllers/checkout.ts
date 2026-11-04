import { type Request, type Response, Router } from 'express';
import { clearAuthentication } from '../middleware/authentication';
import type { BasketItem } from '../models/basket';
import type { Profile } from '../models/profile';
import type { BasketService } from '../services/basket';
import {
    CheckoutError,
    type CheckoutService,
    type DeliveryDetails,
    type PlacedOrder,
    type Quote,
} from '../services/checkout';
import type { ProfileService } from '../services/profileService';

const FIELD_MESSAGES = {
    addressChoice: 'We could not use your saved address. Enter a different address instead',
    firstname: 'Enter a first name (up to 50 characters)',
    surname: 'Enter a surname (up to 50 characters)',
    addressLine1: 'Enter the first line of the address (up to 100 characters)',
    addressLine2: 'Address line 2 must be 100 characters or fewer',
    postcode: 'Enter a valid UK postcode, like BT7 1NT',
    cardNumber: 'Enter a 16-digit card number',
    expiry: 'Enter a card expiry date in the future, like 08/29',
    cvv: 'Enter the 3-digit security code',
} as const;

type FieldName = keyof typeof FIELD_MESSAGES;
type FieldErrors = Partial<Record<FieldName, string>>;

// The order errors are listed in at the top of the page
const FIELD_ORDER: FieldName[] = [
    'addressChoice',
    'firstname',
    'surname',
    'addressLine1',
    'addressLine2',
    'postcode',
    'cardNumber',
    'expiry',
    'cvv',
];

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const GENERIC_ERROR = 'We could not complete your order right now. Please try again.';
const QUOTE_ERROR = 'We could not refresh your order total right now. Please try again before paying.';

type AddressChoice = 'saved' | 'new';

interface FormValues {
    addressChoice: AddressChoice;
    firstname: string;
    surname: string;
    addressLine1: string;
    addressLine2: string;
    postcode: string;
    setAsDefault: boolean;
    discountCode: string;
    cardNumber: string;
    expiry: string;
    cvv: string;
}

interface PageView {
    values: FormValues;
    errors: FieldErrors;
    formError: string | null;
}

interface CheckoutContext {
    items: BasketItem[];
    profile: Profile;
}

function isFieldName(name: string): name is FieldName {
    return name in FIELD_MESSAGES;
}

function hasSavedAddress(profile: Profile): boolean {
    return Boolean(
        profile.firstname && profile.surname && profile.addressLine1 && profile.postcode,
    );
}

function savedAddressLines(profile: Profile): string[] {
    return [
        `${profile.firstname ?? ''} ${profile.surname ?? ''}`.trim(),
        profile.addressLine1,
        profile.addressLine2,
        profile.postcode,
    ].filter((line): line is string => Boolean(line));
}

function defaultValues(profile: Profile): FormValues {
    return {
        addressChoice: hasSavedAddress(profile) ? 'saved' : 'new',
        firstname: '',
        surname: '',
        addressLine1: '',
        addressLine2: '',
        postcode: '',
        setAsDefault: false,
        discountCode: '',
        cardNumber: '',
        expiry: '',
        cvv: '',
    };
}

const EMPTY_PROFILE: Profile = {
    email: '',
    firstname: null,
    surname: null,
    addressLine1: null,
    addressLine2: null,
    postcode: null,
};

function readForm(body: unknown, profile: Profile): FormValues {
    const source = (body ?? {}) as Record<string, unknown>;
    const read = (name: string) => String(source[name] ?? '').trim();

    return {
        addressChoice: hasSavedAddress(profile) && read('addressChoice') !== 'new' ? 'saved' : 'new',
        firstname: read('firstname'),
        surname: read('surname'),
        addressLine1: read('addressLine1'),
        addressLine2: read('addressLine2'),
        postcode: read('postcode'),
        setAsDefault: read('setAsDefault') === 'yes',
        discountCode: read('discountCode'),
        cardNumber: read('cardNumber').replace(/[\s-]/g, ''),
        expiry: read('expiry'),
        cvv: read('cvv'),
    };
}

function expiryIsValid(expiry: string): boolean {
    const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry);
    if (!match) return false;
    // A card is valid until the end of its expiry month
    return new Date(2000 + Number(match[2]), Number(match[1]), 1) > new Date();
}

function validate(values: FormValues): FieldErrors {
    const errors: FieldErrors = {};

    if (values.addressChoice === 'new') {
        if (!values.firstname || values.firstname.length > 50) errors.firstname = FIELD_MESSAGES.firstname;
        if (!values.surname || values.surname.length > 50) errors.surname = FIELD_MESSAGES.surname;
        if (!values.addressLine1 || values.addressLine1.length > 100) {
            errors.addressLine1 = FIELD_MESSAGES.addressLine1;
        }
        if (values.addressLine2.length > 100) errors.addressLine2 = FIELD_MESSAGES.addressLine2;
        if (!UK_POSTCODE.test(values.postcode)) errors.postcode = FIELD_MESSAGES.postcode;
    }

    if (!/^\d{16}$/.test(values.cardNumber)) errors.cardNumber = FIELD_MESSAGES.cardNumber;
    if (!expiryIsValid(values.expiry)) errors.expiry = FIELD_MESSAGES.expiry;
    if (!/^\d{3}$/.test(values.cvv)) errors.cvv = FIELD_MESSAGES.cvv;

    return errors;
}

// Backend errors look like { "delivery.postcode": [...] }. Match them to our form fields.
function fromBackendErrors(
    fieldErrors: Record<string, string[]>,
    choice: AddressChoice,
): FieldErrors {
    const errors: FieldErrors = {};
    for (const key of Object.keys(fieldErrors)) {
        if (choice === 'saved' && key.startsWith('delivery')) {
            errors.addressChoice = FIELD_MESSAGES.addressChoice;
            continue;
        }
        const name = key.split('.').pop() ?? '';
        if (isFieldName(name)) errors[name] = FIELD_MESSAGES[name];
    }
    return errors;
}

function toErrorList(errors: FieldErrors) {
    return FIELD_ORDER.flatMap((name) => {
        const message = errors[name];
        return message ? [{ anchor: name === 'addressChoice' ? 'delivery-address' : name, message }] : [];
    });
}

function deliveryFor(values: FormValues, profile: Profile): DeliveryDetails {
    if (values.addressChoice === 'saved') {
        return {
            firstname: profile.firstname ?? '',
            surname: profile.surname ?? '',
            addressLine1: profile.addressLine1 ?? '',
            addressLine2: profile.addressLine2 ?? '',
            postcode: profile.postcode ?? '',
        };
    }
    return {
        firstname: values.firstname,
        surname: values.surname,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2,
        postcode: values.postcode,
    };
}

function statusOf(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null && 'status' in error) {
        return typeof error.status === 'number' ? error.status : undefined;
    }
    return undefined;
}

function canCheckOut(items: BasketItem[]): boolean {
    return items.length > 0 && items.every((item) => item.isQuantityAvailable);
}

type Handler = (req: Request, res: Response, token: string) => Promise<void>;

export function createCheckoutRouter(
    basket: BasketService,
    profiles: ProfileService,
    checkout: CheckoutService,
): Router {
    const router = Router();

    // The backend rejected our token (expired, revoked or invalid), so the customer must sign in again
    function signInAgain(req: Request, res: Response) {
        clearAuthentication(req, res);
        res.redirect(`/login?returnTo=${encodeURIComponent('/checkout')}&notice=expired`);
    }

    function handleFailure(error: unknown, req: Request, res: Response) {
        if (statusOf(error) === 401) {
            signInAgain(req, res);
            return;
        }
        // Only the message is logged, never the form contents, so card details cannot leak
        console.error('Checkout failed', (error as Error).message);
        res.status(502).render('error.njk', {
            message: 'We could not load checkout right now. Please try again later.',
        });
    }

    function guarded(handler: Handler) {
        return async (req: Request, res: Response) => {
            const token = req.auth?.accessToken;
            if (!token) {
                signInAgain(req, res);
                return;
            }
            try {
                await handler(req, res, token);
            } catch (error) {
                handleFailure(error, req, res);
            }
        };
    }

    async function loadContext(token: string): Promise<CheckoutContext> {
        const [{ items }, profile] = await Promise.all([
            basket.getBasket(token),
            profiles.getProfile(token),
        ]);
        return { items, profile };
    }

    // A bad discount code must not stop the page loading, so fall back to a quote without it
    async function quoteFor(
        token: string,
        discountCode: string,
    ): Promise<{ quote: Quote; discountError: string | null }> {
        if (!discountCode) {
            return { quote: await checkout.getQuote(token, ''), discountError: null };
        }
        try {
            return { quote: await checkout.getQuote(token, discountCode), discountError: null };
        } catch (error) {
            if (error instanceof CheckoutError && error.status === 400) {
                return { quote: await checkout.getQuote(token, ''), discountError: error.message };
            }
            throw error;
        }
    }

    async function renderPage(
        res: Response,
        token: string,
        context: CheckoutContext,
        status: number,
        view: PageView,
        quoteUnavailable = false,
    ) {
        let quote: Quote | null = null;
        let discountError: string | null = null;
        if (!quoteUnavailable) {
            try {
                ({ quote, discountError } = await quoteFor(token, view.values.discountCode));
            } catch (error) {
                if (statusOf(error) === 401) throw error;
                console.error('Checkout quote failed', (error as Error).message);
                quoteUnavailable = true;
            }
        }

        res.set('Cache-Control', 'no-store');
        res.status(discountError && status === 200 ? 400 : status).render('checkout.njk', {
            items: context.items,
            quote,
            hasSavedAddress: hasSavedAddress(context.profile),
            savedAddressLines: savedAddressLines(context.profile),
            // The card number and security code are never sent back to the browser
            values: { ...view.values, cardNumber: '', cvv: '' },
            errors: view.errors,
            errorList: toErrorList(view.errors),
            formError: view.formError ?? (quoteUnavailable ? QUOTE_ERROR : null),
            discountError,
            discountApplied:
                Boolean(view.values.discountCode) &&
                !discountError &&
                quote !== null &&
                quote.discount !== '0.00',
        });
    }

    async function loadPostContext(
        req: Request,
        res: Response,
        token: string,
    ): Promise<CheckoutContext | null> {
        try {
            return await loadContext(token);
        } catch (error) {
            if (statusOf(error) === 401) throw error;
            console.error('Checkout failed', (error as Error).message);
            await renderPage(
                res,
                token,
                { items: [], profile: EMPTY_PROFILE },
                502,
                {
                    values: readForm(req.body, EMPTY_PROFILE),
                    errors: {},
                    formError: GENERIC_ERROR,
                },
                true,
            );
            return null;
        }
    }

    router.get(
        '/',
        guarded(async (_req, res, token) => {
            const context = await loadContext(token);
            if (!canCheckOut(context.items)) {
                res.redirect('/basket');
                return;
            }
            await renderPage(res, token, context, 200, {
                values: defaultValues(context.profile),
                errors: {},
                formError: null,
            });
        }),
    );

    // The Apply button: recalculates the total and keeps everything else the customer typed
    router.post(
        '/discount',
        guarded(async (req, res, token) => {
            const context = await loadPostContext(req, res, token);
            if (!context) return;
            if (!canCheckOut(context.items)) {
                res.redirect('/basket');
                return;
            }
            await renderPage(res, token, context, 200, {
                values: readForm(req.body, context.profile),
                errors: {},
                formError: null,
            });
        }),
    );

    router.post(
        '/',
        guarded(async (req, res, token) => {
            const context = await loadPostContext(req, res, token);
            if (!context) return;
            if (!canCheckOut(context.items)) {
                res.redirect('/basket');
                return;
            }

            const values = readForm(req.body, context.profile);
            const errors = validate(values);
            if (Object.keys(errors).length > 0) {
                await renderPage(res, token, context, 400, { values, errors, formError: null });
                return;
            }

            let order: PlacedOrder;
            try {
                order = await checkout.placeOrder(token, {
                    delivery: deliveryFor(values, context.profile),
                    discountCode: values.discountCode,
                    card: { cardNumber: values.cardNumber, expiry: values.expiry, cvv: values.cvv },
                });
            } catch (error) {
                if (statusOf(error) === 401) throw error;

                if (!(error instanceof CheckoutError)) {
                    console.error('Order could not be placed', (error as Error).message);
                    await renderPage(res, token, context, 502, {
                        values,
                        errors: {},
                        formError: GENERIC_ERROR,
                    });
                    return;
                }

                const fieldErrors = fromBackendErrors(error.fieldErrors, values.addressChoice);
                if (Object.keys(fieldErrors).length > 0) {
                    await renderPage(res, token, context, 400, {
                        values,
                        errors: fieldErrors,
                        formError: null,
                    });
                    return;
                }

                await renderPage(res, token, context, error.status >= 500 ? 502 : error.status, {
                    values,
                    errors: {},
                    formError: error.status >= 500 ? GENERIC_ERROR : error.message,
                });
                return;
            }

            // The order is placed, so a failure here must not look like the order failed
            const wantsDefault = values.addressChoice === 'new' && values.setAsDefault;
            let defaultAddressFailed = false;
            if (wantsDefault) {
                try {
                    await profiles.updateProfile(token, {
                        firstname: values.firstname,
                        surname: values.surname,
                        addressLine1: values.addressLine1,
                        addressLine2: values.addressLine2,
                        postcode: values.postcode,
                    });
                } catch (error) {
                    console.error('Default address not updated', (error as Error).message);
                    defaultAddressFailed = true;
                }
            }

            res.set('Cache-Control', 'no-store');
            res.render('checkout-confirmation.njk', {
                order,
                savedAsDefault: wantsDefault && !defaultAddressFailed,
                defaultAddressFailed,
            });
        }),
    );

    return router;
}
