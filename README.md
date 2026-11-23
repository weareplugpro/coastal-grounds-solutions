# Coastal Grounds Solutions — website

Static site (20 pages) plus one serverless function for the estimate form. No frameworks; the only dependency is `sharp`, which resizes photos uploaded through the dashboard.

```
public/            the site: HTML pages, css/, js/, fonts/, images/, video/, favicons, sitemap.xml, robots.txt
api/lead.js        receives the free-estimate form and forwards it (see "Leads" below)
content/           owner-editable text and photos (edited through Pages CMS, see "Editing")
scripts/build.mjs  copies public/ to dist/, applies content/, fills in the real domain for SEO tags
.pages.yml         the Pages CMS dashboard setup
vercel.json        clean URLs, build settings, caching headers
```

## Deploy on Vercel

1. Put this folder in a GitHub repo (or run `npx vercel` from this folder).
2. In Vercel: **Add New → Project → Import** the repo. Framework preset: **Other**. Leave the build settings alone; `vercel.json` already sets them.
3. Add the lead environment variables below, then deploy.
4. Add the custom domain under **Settings → Domains**. Canonical links, social-share tags, schema and the sitemap pick up the production domain automatically on the next deploy. (To force one, set `SITE_DOMAIN`, e.g. `www.example.com`.)

## Leads (the estimate form)

Set at least one destination in **Settings → Environment Variables**, then redeploy:

| Variable | What it does |
|---|---|
| `LEAD_WEBHOOK_URL` | POSTs each lead as JSON to any webhook: a GoHighLevel inbound webhook, Zapier, Make, Slack, etc. |
| `RESEND_API_KEY` + `LEAD_EMAIL_TO` | Emails each lead via Resend. `LEAD_EMAIL_TO` can be a comma-separated list. |
| `LEAD_EMAIL_FROM` | Optional sender for the email, e.g. `Website <leads@yourdomain.com>` (domain verified in Resend). |

Lead fields: `name, phone, email, town, service, message, page, source, received_at`.

If no destination is set, or delivery fails, the form tells the visitor and offers a one-tap text message to (239) 887-8922 with their details already filled in, so no lead is lost. A hidden honeypot field and a minimum fill time drop bot submissions.

## Preview locally

```
node scripts/build.mjs && npx serve dist
```
(The form endpoint only runs on Vercel or with `npx vercel dev`.)

## Editing

**Owner dashboard (Pages CMS).** Kevin edits through https://app.pagescms.org. It works on the files in `content/`:

| File | What it controls |
|---|---|
| `content/business.json` | Phone number and opening/closing time, everywhere: page text, call/text buttons, schema data, form fallback |
| `content/home.json` | Homepage hero: small line, headline, green ending, sentence under it |
| `content/work-photos.json` | The 6 "latest work" photos and captions (homepage + About). First one is the big tile |
| `content/reviews.json` | Google review cards (homepage, About, Services) |

Every save in Pages CMS commits to the GitHub repo, and Vercel rebuilds the site. `scripts/build.mjs` applies the content files to the pages; if an entry is unusable it logs a warning and keeps the original text, so a bad edit never takes the site down. New photos are resized to WebP (1600px and 800px) during the build. The dashboard's fields are defined in `.pages.yml`.

**Everything else** (layout, service and town pages, wording elsewhere) is plain HTML in `public/` (`services/irrigation.html` serves at `/services/irrigation`). Styles are in `public/css/site.css`, behavior in `public/js/site.js`. Leave the original phone number and "7 AM to 5 PM" in the HTML as written: the build swaps them for the values in `content/business.json`.

## Notes

- The hero video and poster are self-hosted in `public/video/`. The reference site pulled them from a third party's Cloudinary account.
- The reference site loaded a third-party tracking script (`brightengine…railway.app`). It has been removed. Add your own analytics (GA4, Meta Pixel) if wanted.
- Google reviews are quoted word for word, because they are real customers' words.
