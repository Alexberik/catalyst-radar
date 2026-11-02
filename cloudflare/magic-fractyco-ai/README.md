# MAGIC Fractyco AI Worker

Private server-side vision bridge for the MAGIC Trading Assistant on GitHub Pages.

## What it does

- Accepts 1–5 PNG/JPEG/WEBP screenshots from the Fractyco demo workflow.
- Sends them to the OpenAI Responses API using `gpt-4.1-mini` vision.
- Returns a Russian-language report with screenshot facts, calculations, assumptions and demo-only recommendations.
- Does not connect to Fractyco, read account data, store screenshots, or execute trades.
- Uses `store: false` for Responses API requests.

## Deploy

1. Create a Cloudflare account and open Workers & Pages.
2. Install Node.js LTS locally.
3. From this directory run:
   ```bash
   npm install -g wrangler
   npx wrangler login
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler deploy
   ```
4. Paste your OpenAI API key only into the Wrangler secret prompt. Never put it in GitHub, HTML, chat, or `wrangler.jsonc`.
5. After deploy, note the Worker URL, normally `https://magic-fractyco-ai.<your-subdomain>.workers.dev`.
6. Test `https://<worker-host>/health`. Expected JSON: `{"ok":true,...}`.
7. In the Fractyco assistant page, enter `https://<worker-host>/analyze` in the AI backend field, save, test, then run AI analysis.

## Important security setup before public use

The Worker allows browser requests only from `https://alexberik.github.io` and localhost. CORS is not authentication and does not stop direct scripted requests. Before sharing this endpoint publicly, configure a Cloudflare rate-limiting rule for this Worker (for example, a conservative per-IP request limit on `/analyze`) and monitor OpenAI usage/budget limits. Do not expose the Worker URL as a public service for others.

## Request contract

`POST /analyze`

```json
{
  "images": [
    {
      "name": "dashboard.png",
      "mimeType": "image/png",
      "dataUrl": "data:image/png;base64,..."
    }
  ],
  "prompt": "Analyze these Fractyco demo tournament screenshots"
}
```

Response: `{ "analysis": "...", "model": "...", "generatedAt": "...", "mode": "demo-only", "sources": [...] }`

## Endpoints

- `GET /health` — service health check.
- `POST /analyze` — vision analysis.
- `OPTIONS` — CORS preflight.

## Limits

- Maximum 5 screenshots per request.
- PNG, JPEG and WEBP only.
- Maximum ~4 MB per image payload and ~13.5 MB combined encoded payload.
- No account credentials, cookies, QR login codes, private keys or seed phrases should ever be submitted.
