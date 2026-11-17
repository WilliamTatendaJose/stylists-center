# Agent subscription through Google Play and the App Store

Google Play and the App Store require a subscription that unlocks something in the app to be sold through
their own billing. Apple Pay and Google Pay are payment methods inside that billing; they can't replace it.
The code for this is built and shipped, and it stays **off** until the steps below are done. Until then the
app keeps taking mobile money, as today.

How it works:

- **Store app only.** When the console switch is on, the store build (the `production` channel) shows
  **Subscribe for $x**, **Restore purchase** and **Manage or cancel**. Test (preview) builds keep mobile money.
- **The server checks every purchase with the store.** Google Play Developer API on Android, App Store
  Server API on iOS. The app tags each purchase with the user's id, so a purchase can't be claimed by
  another account.
- **The agent's paid-until date** moves to the store's expiry date. Renewals, cancellations, failed payments
  and refunds arrive as store notifications. A longer mobile-money period is never shortened.
- **The first paid subscription** still pays the recruiter's reward.

The native billing library ships in the **next store build**. Builds made before it can't buy through the
store.

## Google Play

1. **Upload a build** with billing to a test track: run _Mobile Build_ with profile `production` and upload
   the `.aab` to **Internal testing**. Play only lets you create subscriptions after that.
2. **Create the subscription:** Play Console → Monetize → Products → **Subscriptions** → Create.
   - Product ID: `agent_monthly` (or another ID, then set it in the console; see the last section).
   - Add a **base plan**: auto-renewing, monthly, and your price in USD. Activate it.
3. **Give the server access:**
   1. In Google Cloud, in the project linked to Play Console, enable the **Google Play Android Developer
      API** and create a service account. Create a **JSON key** for it.
   2. In Play Console → **Users and permissions** → Invite new user, enter the service account's email.
      Give it _View financial data_ and _Manage orders and subscriptions_ for this app.
   3. In Railway → `api` → Variables, add `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` with the whole JSON key as the
      value. It's a secret, so paste it into Railway yourself, not into chat.

   Permissions can take up to a day to start working.

4. **Real-time notifications** (renewals, cancellations, refunds):
   1. In Google Cloud → Pub/Sub, create a topic, e.g. `play-billing`. Grant
      `google-play-developer-notifications@system.gserviceaccount.com` the **Pub/Sub Publisher** role on it.
   2. Make up a long random value and set it in Railway as `GOOGLE_PLAY_RTDN_TOKEN`.
   3. Create a **push** subscription on the topic with this endpoint:
      `https://api-production-2b23.up.railway.app/v1/store/google/notifications?token=<that value>`
   4. In Play Console → Monetize → Monetization setup, set the topic name
      (`projects/<project>/topics/play-billing`) and press **Send test notification**.
5. **Testers:** add the testers' Gmail addresses under Settings → **License testing**. Their purchases are
   free test purchases that renew every few minutes.

## App Store (when you launch on iPhone)

1. In App Store Connect → your app → **Subscriptions**, create a subscription group and a subscription with
   product ID `agent_monthly`. Monthly, your price, and a review screenshot.
2. In Users and Access → Integrations → **In-App Purchase**, generate a key. Note its **Key ID** and the
   **Issuer ID** shown on the page, and download the `.p8` file.
3. In Railway, set:
   - `APPLE_IAP_ISSUER_ID`
   - `APPLE_IAP_KEY_ID`
   - `APPLE_IAP_PRIVATE_KEY`: the contents of the `.p8` file. Line breaks can be written as `\n`.
4. In App Store Connect → App Information → **App Store Server Notifications**, set the production and
   sandbox URLs to `https://api-production-2b23.up.railway.app/v1/store/apple/notifications` and choose
   **Version 2**.
5. **Test** with a sandbox tester (Users and Access → Sandbox) on a TestFlight build.

## Switch it on

In the admin console → Settings → **Subscriptions**:

- **Store subscription product ID**: must match the ID in the stores (default `agent_monthly`).
- **Agent subscription through Google Play / App Store**: set to **On** once the Google Play steps work for
  a license tester.

## Things to know

- **Price:** the store sets the price the agent sees. Google and Apple keep 15% of subscription payments
  (Apple's Small Business Program), so set the store price to cover that.
- **Cards:** most Play purchases in Zimbabwe need a Visa or Mastercard card on the Google account. Agents
  without one can still pay through staff, but the app must not mention or link to that option.
- **Records:** store payments are kept in their own table (`StoreSubscription`), not in the admin console's
  payments list yet.
