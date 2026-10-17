# PayPal sandbox setup

Everything here happens in the sandbox. Never paste keys into chat, code or commits; they go in `.env.local` (git ignored) and later in the Render dashboard.

## 1. Developer account

Sign in at https://developer.paypal.com with your PayPal account and make sure the toggle at the top reads **Sandbox**.

## 2. Sandbox accounts (Testing Tools > Sandbox Accounts > Create account)

PayPal creates one default business and one default personal account. Create what is missing so you end up with:

| Role | Type | Country | Used for |
| --- | --- | --- | --- |
| Sample Sports Outlet | Business | United States | Default payee, merchant dashboard |
| Example Running Co. | Business | United States | Second store (payee override) |
| Demo Shoe Supply | Business | United States | Third store (payee override) |
| Test buyer | Personal | United States | Buyer approvals and opening test disputes; this login goes in the judges' testing instructions |

For each business account, note its email and its **Merchant ID** (open the account, Profile tab). These are not secrets but they go in env vars too.

## 3. REST app (Apps & Credentials > Sandbox > Create App)

- Name: `Mandate`
- Type: Merchant
- Sandbox business account: the Sample Sports Outlet one
- Copy **Client ID** and **Secret** into `.env.local` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
- In the app's settings, under **Features** (App Feature Options): tick **Accept payments**, then under **Advanced options** make sure **Vault** is selected. Also make sure **Customer disputes** is ticked under Add-on services.

## 4. Webhook (inside the app, Sandbox Webhooks > Add Webhook)

Needs a public HTTPS URL, so this step waits until a Render preview or a local tunnel exists. I will give you the URL. Events to tick:

- `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`
- `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`

Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID` (needed for signature verification).

## 5. Anthropic key

Create a dedicated key at https://console.anthropic.com with a monthly spend limit (the public demo calls it for every judge), and put it in `ANTHROPIC_API_KEY`.

## `.env.local` shape

```
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_MERCHANT_ID_SPORTS_OUTLET=
PAYPAL_MERCHANT_ID_RUNNING_CO=
PAYPAL_MERCHANT_ID_SHOE_SUPPLY=
ANTHROPIC_API_KEY=
DATABASE_URL=
```

Still to verify in `/scripts`: that a single app can pay the other two business accounts through `purchase_units[].payee`, and how a sandbox dispute is opened.
