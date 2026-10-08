# forge-home

A self-hosted start page for your apps. It lists every app with its favicon and live status (up / slow / down, HTTP code, response time), checked every 30 seconds.

Everything is configured from the browser: no config file to write, no restart needed.

> The interface is currently in French.

## Features

- **First-run setup wizard**: page title, optional favicon, layout, apps, and who is allowed to edit.
- **Edit anytime** with the pencil button ✎.
- **Four layouts**:
  - **Cards**: a simple, clean grid.
  - **Launcher**: big icons, a clock, and a search bar (press `/` to search, `Enter` to open), like a phone home screen.
  - **Dashboard**: key numbers, an alert banner when an app goes down, and a response-time history.
  - **Minimal**: terminal style, dense, with a keyboard shortcut for each app.
- **Categories** to group your apps.
- **Internal URLs**: check an app through its Docker container name (`http://jellyfin:8096`) while the link still opens its public address.
- **Favicons are fetched automatically** from each app (`<link rel="icon">` or `/favicon.ico`). If none is found, the app's initial is shown instead.
- **Edit protection**: none, a password, or **Discord login**, where the first Discord account to sign in becomes the owner.
- Light and dark themes.

## Install

```bash
git clone https://github.com/thomas-bsn/forge-home.git && cd forge-home
docker compose up -d
```

Then open http://localhost:3000, or your server's address, and follow the setup wizard.

Without Docker Compose:

```bash
docker build -t homepage .
docker run -d -p 3000:3000 -v homepage-data:/data --restart unless-stopped homepage
```

> ⚠️ Until the wizard is completed, **anyone who opens the page can set it up**. Complete it right after installing.

## Edit protection

| Mode | Who can edit |
|---|---|
| None | Anyone who can open the page. Fine if it is only reachable on your home network. |
| Password | Anyone who knows the password (at least 8 characters). |
| Discord | Only the owner's Discord account. |

### Setting up Discord login

The wizard walks you through these steps:

1. Create an application at https://discord.com/developers/applications (the name doesn't matter).
2. In **OAuth2 → Redirects**, add the URL shown by the wizard, for example `https://home.example.com/api/auth/discord/callback`.
3. Paste the **Client ID** and **Client Secret** into the wizard.
4. When you finish, you are sent to Discord. **The first account that signs in becomes the owner** of the page.

Discord only accepts the redirect URL you registered, so always open the page from the same address (same domain or IP).

## Data

Everything is stored in the `/data` volume:

- `config.json` holds the title, layout, apps and protection settings. The password is stored as a hash; Discord credentials are stored as entered.
- `favicon` is the image uploaded in the wizard.

`config.json` is read on every request, so manual edits take effect immediately.

**To start over**, or if you lost the password, delete `config.json` and the wizard comes back:

```bash
docker compose exec homepage rm /data/config.json
```

## Checking apps by container name

Each app has two addresses:

- **URL**: the address your browser opens when you click the app, for example `https://jellyfin.example.com` or `http://192.168.1.10:8096`.
- **Internal URL** (optional): the address the server uses to check the status and fetch the icon, for example `http://jellyfin:8096`. Only signed-in admins can see it.

Container names only resolve inside Docker, so the homepage container must be on the same Docker network as your apps. Uncomment the `networks` section in `docker-compose.yml`:

```yaml
services:
  homepage:
    # ...
    networks:
      - default
      - my-network

networks:
  my-network:
    external: true
```

Replace `my-network` with your network's name (`docker network ls` lists them). Use the container's internal port, not the port published on the host.

> `localhost` does not work as an internal URL: inside the container it points to the homepage container itself.

## Status rules

- **Up**: the app responds with a status code below 500. An app behind a login (401/403) counts as up.
- **Slow**: up, but the response took more than 1 second.
- **Down**: a 5xx error, a connection error, or no response within 3 seconds.

The response-time history shown in the Dashboard layout is kept in memory and resets when the server restarts.

## Behind a reverse proxy

The app works behind Traefik, Nginx, Caddy and similar proxies. Session cookies are marked `Secure` automatically when the proxy sends `X-Forwarded-Proto: https`.

For apps that use self-signed certificates, set `NODE_TLS_REJECT_UNAUTHORIZED=0` on the container. This turns off TLS verification for the whole server.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `/data` in Docker, `./data` otherwise | Where the configuration is stored |

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run dev                  # Vite on http://localhost:5173 + API on port 3000
npm run build && npm start   # serves the production build on http://localhost:3000
```

Stack: Express 5 (backend), React 19 and Vite (frontend). The only runtime dependency is Express.

## Security notes

- The favicon proxy (`/api/favicon?url=`) only fetches URLs of configured apps, so it cannot be used to make the server request arbitrary addresses.
- Sessions are HMAC-signed cookies (`HttpOnly`, `SameSite=Lax`). Changing the protection mode signs everyone out.
- Password attempts are limited to 5 per minute per IP.

## License

[MIT](LICENSE)
