# Coin Move Report - 11ty + Netlify Starter

Minimal starter project for a daily crypto mover report site.

## What it does

- Builds a homepage
- Builds a reports archive page
- Builds one detail page per report item in `src/_data/reports.js`
- Works on Netlify with static hosting

## Local setup

```bash
npm install
npm run start
```

Local preview will be available from Eleventy dev server.

## Deploy to Netlify

1. Push this folder to GitHub
2. Import the repo into Netlify
3. Netlify will use:
   - Build command: `npm run build`
   - Publish directory: `_site`

## Where to edit

- Site title and Binance referral: `src/_data/site.js`
- Daily reports data: `src/_data/reports.js`
- Homepage: `src/index.njk`
- Report template: `src/reports/report.njk`
- Styles: `src/assets/style.css`

## Notes

This starter ships with sample report data so you can see the structure first.
Later, you can replace the sample data inside `src/_data/reports.js` with API-driven logic.
