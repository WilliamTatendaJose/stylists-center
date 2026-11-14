# Google Play readiness

Audit of the Android app (`zw.co.stylistscenter.app`) against Google Play review, done 14 Nov 2026.
Fixed in code: account deletion, unused permissions, report and block in chat, and public legal pages.
**Still needed before submitting:** real legal text, a decision on the agent subscription, a reviewer account,
and the Play Console forms.

## Blockers

| #   | Issue                                                                                            | Play rule                                                                               | Status                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | No way to delete an account in the app or on the web                                             | Account deletion requirement (apps that create accounts)                                | **Fixed.** Profile → Delete account. Web page: `/delete-account`                                               |
| 2   | Privacy policy and all four terms are placeholder text ("…will be published here before launch") | User Data policy: a real privacy policy, inside the app and on the listing              | **You:** paste the draft below (edited and checked) into the console's Content page. Do the same for the terms |
| 3   | No public web address for the privacy policy                                                     | The listing needs a privacy policy URL                                                  | **Fixed.** `/legal/privacy` and `/legal/terms-clients` (etc.) show the console text as a web page              |
| 4   | Agent subscription is paid inside the app with mobile money                                      | Payments policy: digital subscriptions and in-app features must use Google Play Billing | **Your decision.** See below                                                                                   |
| 5   | Users chat and post reviews, but you can't report or block the other person in a chat            | User Generated Content policy: in-app reporting and blocking                            | **Fixed.** Chat ⋮ menu → Report (goes to the console's reports queue) and Block/Unblock                        |

## Fixed, but needs a new build

| Issue                                                                                                      | Change                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The manifest asked for **microphone**, **camera** and **draw over other apps**, none of which the app uses | Removed from the manifest (`blockedPermissions` in app.config.ts). Photos come from the system photo picker, which needs no permission |

Account deletion, and report and block, are JavaScript changes: they reach installed apps over the air.
The permission change only takes effect in the next build.

## The agent subscription (blocker 4)

Agents pay a subscription in the app (EcoCash, OneMoney, InnBucks, O'mari, card) to take part in the agent
programme. Google treats a subscription that unlocks something inside the app as a digital good. Those must
be sold through Google Play Billing, and Google takes 15%. Paying for real-world services (bookings, shop
goods, stylists' platform fees) is exempt, so everything else is fine.

This is my reading of the policy, not Google's ruling. A reviewer may let it through and flag it later, or
reject the app. Options:

1. **Take payment out of the app (recommended).** The agent screen says how to subscribe (staff, or a web
   page) without a pay button or price inside the app. This keeps the 100%, and the app passes review.
2. Add Google Play Billing for that subscription only. This means a new native module and Play
   subscription products, and Google takes 15%.
3. Make the agent programme free and earn only from commissions.

## Play Console: what to fill in

**Reviewer access (App content → App access):** reviewers can't receive a code, so create a ready-to-use
**email + password** client account, and ideally a stylist account. Make sure they have sample data: a
stylist near Harare with services, and a shop with a product. Enter both sets of credentials in the form.

**Data safety form:**

| Data                                            | Collected | Shared                          | Why                                                           | Optional |
| ----------------------------------------------- | --------- | ------------------------------- | ------------------------------------------------------------- | -------- |
| Name, email, phone                              | Yes       | No                              | Account, communication                                        | No       |
| Precise location                                | Yes       | No                              | Finding nearby stylists; live trip location (foreground only) | Yes      |
| Photos                                          | Yes       | No                              | Profile, portfolio, products, ID verification                 | Yes      |
| Messages (in-app chat, attachments)             | Yes       | No                              | Talking to stylists/shops                                     | Yes      |
| Purchase history (bookings, orders)             | Yes       | No                              | App functionality                                             | No       |
| Financial info (mobile money number at payment) | Yes       | Yes, with the payment processor | Payments                                                      | Yes      |
| ID document and selfie                          | Yes       | No                              | Verifying stylists and agents                                 | Yes      |
| Device push token                               | Yes       | No                              | Notifications                                                 | Yes      |

Also declare: data is encrypted in transit (HTTPS), users can request deletion (link `/delete-account`),
and no data is sold.

**Content rating:** answer the questionnaire. It covers user-to-user chat and real-money payments for
services, with no gambling, so expect roughly "Everyone / PEGI 3" with the _Users interact_ flag.
**Target audience:** 18+. A booking marketplace with payments shouldn't target children.

**Financial features declaration:** answer it. Wallet cash-out of earnings is a payment feature, not a
loan or crypto.

**Store listing:** at least 2 phone screenshots, a 512×512 icon, a 1024×500 feature graphic, a short and a
full description, and a support email.

## Before the production build

- **Version.** `version` is `0.2.0` and over-the-air updates follow it (`runtimeVersion: appVersion`).
  Keep it at `0.2.0` so the store build and current test phones get the same updates, or change it to
  `1.0.0` and also make a new preview build. Raise `android.versionCode` by 1 for every upload.
- **Update channel.** The production build listens on the `production` channel. Once the app is live,
  publish each over-the-air update to **both** `preview` and `production` (the OTA workflow has a choice
  for each).
- **Build.** Run the _Mobile Build_ workflow with profile `production`. That produces the `.aab` to upload.
  Play App Signing then manages the store key.

## Draft privacy policy (edit and check before publishing)

This is written from what the code actually does. Fill in the bracketed details, and have someone check it
against Zimbabwe's Cyber and Data Protection Act. I'm not a lawyer.

> **StylistsCenter privacy policy**
>
> StylistsCenter ("we") runs the Style Center app, which connects clients with stylists and beauty shops in
> Zimbabwe. This policy explains what we collect, why, and your choices. Contact: [support email],
> [support phone/WhatsApp], [postal address].
>
> **What we collect**
>
> - _Account details:_ your name, email address, phone number and profile photo, and your Google account
>   name and email if you sign in with Google.
> - _Location:_ your device's location while you use the app, to show nearby stylists and shops, work out
>   distances and delivery charges, and share a stylist's live location during a booked trip. We don't
>   collect location in the background.
> - _Bookings, orders and payments:_ what you book or buy, from whom, when, prices, coins used, and the
>   payment status. If you pay by mobile money or card, your payment details go to our payment processor
>   (Pesepay/Paynow). We don't store card numbers.
> - _Messages:_ chats between you and stylists or shops, including files you attach.
> - _Reviews and reports:_ reviews you write and reports you make.
> - _Verification:_ if you become a stylist, vendor or agent, your ID document and a selfie, used only to
>   verify you.
> - _Shop and stylist details:_ business name, address, services, products, photos and working hours,
>   which are public in the app.
> - _Device information:_ a notification token so we can send you notifications, plus basic technical logs
>   (IP address, app version, errors) to keep the service secure and working.
>
> **How we use it:** to run your account and bookings, connect you with stylists and shops, process
> payments and rewards, send booking, message and payment notifications, keep the platform safe (fraud,
> abuse, reports), provide support, and meet legal obligations.
>
> **Who we share it with:** the stylist or shop you book or buy from (your name, booking or order details,
> and the delivery address you choose), and service providers that run parts of the app for us: Google
> Firebase (sign-in), Expo and Google Firebase Cloud Messaging (notifications), our payment processors
> (Pesepay/Paynow), MapTiler (maps), OpenStreetMap routing (distances), and our hosting and storage
> providers. We don't sell your data. We may disclose information if the law requires it.
>
> **How long we keep it:** for as long as your account is open. When you delete your account we remove your
> name, contact details, photos, ID documents and sign-in. We keep records of past bookings, orders and
> payments, without your name, for as long as financial and tax law requires.
>
> **Your choices:** you can edit your profile, turn off notifications and location in your phone's
> settings, and delete your account in the app (Profile → Delete account) or as described at
> [API domain]/delete-account. You can ask us for a copy of your data, or to correct it, by contacting us.
>
> **Children:** the app is for people aged 18 and over.
>
> **Security:** data travels over encrypted connections, and access to it is limited to staff who need it.
>
> **Changes:** we will update this page and the date above when this policy changes.
