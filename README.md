# forge-home

A self-hosted start page for your apps, with their live status. Everything is configured from the browser.

> The interface is currently in French.

## Install

```bash
git clone https://github.com/thomas-bsn/forge-home.git && cd forge-home
docker compose up -d
```

Open http://localhost:3000 (or your server's address) and follow the setup wizard.

> ⚠️ Until the wizard is completed, **anyone who opens the page can set it up**. Complete it right after installing.

## Customize for your server

Never edit `docker-compose.yml` or `Dockerfile`: the next `git pull` would conflict with your changes. Use these files instead, which git ignores:

**Port, Docker network, environment variables** → `docker-compose.override.yml`. Docker Compose merges it automatically.

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
# uncomment what you need
```

**The image itself** (e.g. adding a CA certificate) → copy the Dockerfile and tell Compose to build from the copy:

```bash
cp Dockerfile Dockerfile.local
```

```yaml
# docker-compose.override.yml
services:
  homepage:
    build:
      dockerfile: Dockerfile.local
```

## Update

```bash
git pull
docker compose up -d --build
```

Your configuration is kept: it lives in the `homepage-data` volume. Signed-in admins see a notice when a new version is out.

If `git pull` complains about local changes, move them to the override files above, then run `git checkout -- docker-compose.yml Dockerfile`.

## Lost password / start over

```bash
docker compose exec homepage rm /data/config.json
```

The setup wizard comes back on the next page load.

## Development

```bash
npm install
npm run dev   # http://localhost:5173
```

To publish a release: bump `version` in `package.json`, commit and push, then `gh release create vX.Y.Z --generate-notes`.

## License

[MIT](LICENSE)
