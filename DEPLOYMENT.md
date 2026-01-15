# BookClubBot - Production Deployment Guide

Complete step-by-step guide for deploying BookClubBot to Digital Ocean with automated CI/CD.

## Architecture Overview

- **Backend + Mini App**: Single Docker container serving both API and frontend
- **Database**: SQLite stored in `/opt/bookclub-bot/data` (persisted across deployments)
- **HTTPS**: Nginx reverse proxy with Let's Encrypt SSL
- **CI/CD**: GitHub Actions automatically deploys on push to `main`
- **Container Registry**: GitHub Container Registry (ghcr.io)

---

## Prerequisites

✅ Digital Ocean droplet (Ubuntu 20.04 or newer)
✅ Domain name with DNS pointing to your droplet IP (e.g., `vas3k-books.etolstoy.com`)
✅ SSH access to your droplet
✅ GitHub repository with this code
✅ Telegram bot token from @BotFather
✅ OpenAI API key

---

## Part 1: Server Setup (One-Time)

### Step 1: SSH into Your Droplet

```bash
ssh root@your-droplet-ip
# or
ssh your-user@your-droplet-ip
```

### Step 2: Install Docker and Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt update
sudo apt install -y docker-compose

# Verify installation
docker --version
docker-compose --version
```

### Step 3: Set Up DNS

Make sure your domain (`vas3k-books.etolstoy.com`) has an A record pointing to your droplet's IP address.

```bash
# Test DNS resolution (run from your local machine)
nslookup vas3k-books.etolstoy.com
```

Wait for DNS propagation (can take up to 48 hours, but usually 5-30 minutes).

### Step 4: Copy and Run HTTPS Setup Script

**Option A: Clone the repository on the server**

```bash
cd /tmp
git clone https://github.com/yourusername/BookClubBot.git
cd BookClubBot
chmod +x setup_https.sh
sudo ./setup_https.sh vas3k-books.etolstoy.com
```

**Option B: Copy script from local machine**

```bash
# From your local machine
scp setup_https.sh root@your-droplet-ip:/tmp/
ssh root@your-droplet-ip
cd /tmp
chmod +x setup_https.sh
sudo ./setup_https.sh vas3k-books.etolstoy.com
```

This script will:
- Install Nginx and Certbot
- Configure Nginx reverse proxy (port 3001 → HTTPS)
- Obtain SSL certificate from Let's Encrypt
- Enable automatic certificate renewal

### Step 5: Verify Nginx is Running

```bash
sudo systemctl status nginx
sudo nginx -t
```

You should see: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

---

## Part 2: GitHub Configuration

### Step 6: Set Up SSH Key for Deployment

**On your droplet:**

```bash
# Generate deployment key (or use existing key)
cat ~/.ssh/id_rsa
# OR create new key:
ssh-keygen -t rsa -b 4096 -C "github-actions"
cat ~/.ssh/id_rsa
```

Copy the **private key** (entire output including `-----BEGIN` and `-----END` lines).

### Step 7: Configure GitHub Secrets

Go to your GitHub repository:
`Settings → Secrets and variables → Actions → New repository secret`

Add the following secrets:

| Secret Name | Value | Example |
|------------|-------|---------|
| `DEPLOY_HOST` | Your droplet IP address | `159.89.123.45` |
| `DEPLOY_USER` | SSH user (usually `root`) | `root` |
| `DEPLOY_SSH_KEY` | Private SSH key from Step 6 | `-----BEGIN RSA PRIVATE KEY-----...` |
| `BOT_TOKEN` | Telegram bot token | `123456:ABC-DEF...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `GOOGLE_BOOKS_API_KEY` | Google Books API key | `AIza...` |
| `TARGET_CHAT_ID` | Target chat ID (as string) | `-1001234567890` |
| `ADMIN_CHAT_ID` | Admin chat ID (optional) | `-1009876543210` |
| `ADMIN_USER_IDS` | Comma-separated user IDs (optional) | `123456789,987654321` |
| `MINI_APP_URL` | Your domain URL | `https://vas3k-books.etolstoy.com` |

**Important Notes:**
- Chat IDs should be strings with quotes in GitHub Secrets: `-1001234567890`
- To find chat IDs: Send a message to your bot/group, then visit:
  ```
  https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
  ```
- For `MINI_APP_URL`, use your production domain (without trailing slash)

### Step 8: Configure Bot Domain in BotFather

Open Telegram and message [@BotFather](https://t.me/BotFather):

```
/setdomain
→ Select your bot
→ Enter: vas3k-books.etolstoy.com
```

This allows Telegram Mini App to work correctly.

---

## Part 3: Deploy the Application

### Step 9: Make GitHub Container Registry Public (One-Time)

After your first deployment succeeds:

1. Go to `https://github.com/yourusername/BookClubBot/pkgs/container/bookclubbot`
2. Click "Package settings"
3. Scroll to "Danger Zone" → "Change visibility" → "Public"

This allows your droplet to pull images without authentication issues.

### Step 10: Trigger First Deployment

**Option A: Push to main branch**

```bash
git add .
git commit -m "Configure production deployment"
git push origin main
```

**Option B: Manually trigger workflow**

1. Go to `Actions` tab in GitHub
2. Select "Build and Deploy" workflow
3. Click "Run workflow" → "Run workflow"

### Step 11: Monitor Deployment

Watch the deployment progress:

1. **In GitHub**: `Actions` tab → Click on the running workflow
2. **On the server**: SSH in and watch logs:

```bash
ssh root@your-droplet-ip

# Check if directory was created
ls -la /opt/bookclub-bot/

# Watch container logs (after deployment completes)
cd /opt/bookclub-bot
docker-compose logs -f
```

---

## Part 4: Verification

### Step 12: Test the Deployment

**Check if container is running:**

```bash
ssh root@your-droplet-ip
cd /opt/bookclub-bot
docker ps
```

You should see `bookclub-bot` container running.

**Check logs:**

```bash
docker-compose logs -f
```

Look for:
- `Book Club Bot starting...`
- `API server listening on port 3001`
- `All services started successfully!`

**Test the website:**

```bash
# From your local machine
curl https://vas3k-books.etolstoy.com/api/health
```

Should return: `{"status":"ok"}`

**Test in browser:**

Open `https://vas3k-books.etolstoy.com` - you should see the Mini App frontend.

### Step 13: Test Telegram Bot

1. Open Telegram and find your bot
2. Send `/start` - should receive welcome message
3. Post a message with your review hashtag (default: `#рецензия`) in the target chat
4. Bot should respond with book confirmation flow

### Step 14: Test Mini App

1. In Telegram, tap on the bot's menu button or send `/start`
2. Should see a button to open the Mini App
3. Mini App should load with book reviews, leaderboards, etc.

---

## Part 5: Ongoing Maintenance

### How Automated Deployment Works

After initial setup, **every push to `main` branch automatically**:

1. Builds new Docker image
2. Pushes to GitHub Container Registry
3. SSHs to your droplet
4. Pulls latest image
5. Restarts container
6. Runs database migrations
7. Cleans up old images

**You don't need to SSH into the server for normal deployments!**

### Manual Operations

**View logs:**

```bash
ssh root@your-droplet-ip
cd /opt/bookclub-bot
docker-compose logs -f
```

**Restart container:**

```bash
cd /opt/bookclub-bot
docker-compose restart
```

**Stop container:**

```bash
cd /opt/bookclub-bot
docker-compose down
```

**Update environment variables:**

GitHub Secrets are injected during deployment. To update:
1. Update secret in GitHub repo settings
2. Push any commit to `main` (or manually trigger workflow)
3. Deployment will restart with new values

**Database backup:**

```bash
cd /opt/bookclub-bot/data
sudo cp bookclub.db bookclub.db.backup-$(date +%Y%m%d)
```

**Manual database migration:**

```bash
cd /opt/bookclub-bot
docker-compose exec bookclub-bot npx prisma migrate deploy
```

---

## Troubleshooting

### Deployment fails at "Build and push Docker image"

**Issue**: GitHub Actions can't build the image.

**Solution**: Check build logs in GitHub Actions. Common causes:
- Syntax errors in Dockerfile
- Missing dependencies in package.json
- Mini-app build failures

### Deployment fails at "Deploy to Digital Ocean"

**Issue**: Can't SSH to droplet.

**Solutions**:
- Verify `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` secrets
- Test SSH manually: `ssh root@your-droplet-ip`
- Check SSH key format (must include `-----BEGIN` and `-----END` lines)

### Container won't start

**Issue**: `docker ps` shows no `bookclub-bot` container.

**Solutions**:

```bash
cd /opt/bookclub-bot
docker-compose logs

# Check for common issues:
# - Missing environment variables
# - Database migration failures
# - Port 3001 already in use
```

### Website shows "502 Bad Gateway"

**Issue**: Nginx can't reach the backend container.

**Solutions**:

```bash
# Check if container is running
docker ps

# Check nginx config
sudo nginx -t

# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Verify container is listening on 127.0.0.1:3001
curl http://127.0.0.1:3001/api/health
```

### SSL certificate not working

**Issue**: HTTPS not working or certificate errors.

**Solutions**:

```bash
# Re-run certbot manually
sudo certbot --nginx -d vas3k-books.etolstoy.com --force-renewal

# Check certificate expiration
sudo certbot certificates
```

### Bot not responding to messages

**Issue**: Bot doesn't respond to hashtags or commands.

**Solutions**:

1. Check bot token is correct: `BOT_TOKEN` secret
2. Verify `TARGET_CHAT_ID` matches your group chat
3. Check bot logs: `docker-compose logs -f | grep -i error`
4. Ensure bot is added to the target group with message reading permissions

### Mini App not loading in Telegram

**Issue**: Telegram shows error when opening Mini App.

**Solutions**:

1. Verify `MINI_APP_URL` matches your domain (no trailing slash)
2. Confirm `/setdomain` in BotFather matches your domain
3. Check browser console for errors (open Mini App in browser first)
4. Verify HTTPS is working: `curl https://vas3k-books.etolstoy.com`

---

## Quick Reference

### Essential Commands

```bash
# SSH to server
ssh root@your-droplet-ip

# Navigate to app directory
cd /opt/bookclub-bot

# View running containers
docker ps

# View logs (all)
docker-compose logs -f

# View logs (last 100 lines)
docker-compose logs --tail=100

# Restart app
docker-compose restart

# Stop app
docker-compose down

# Start app
docker-compose up -d

# Pull latest image manually
docker-compose pull && docker-compose up -d

# Database backup
sudo cp data/bookclub.db data/bookclub.db.backup-$(date +%Y%m%d)

# Check disk space
df -h

# Clean up old Docker images
docker system prune -f
```

### Important File Locations

| File | Location |
|------|----------|
| Application | `/opt/bookclub-bot/` |
| Database | `/opt/bookclub-bot/data/bookclub.db` |
| Docker Compose | `/opt/bookclub-bot/docker-compose.yml` |
| Nginx Config | `/etc/nginx/sites-available/bookclub-bot` |
| Nginx Logs | `/var/log/nginx/` |
| SSL Certificates | `/etc/letsencrypt/live/vas3k-books.etolstoy.com/` |

---

## Security Notes

- Database contains user data - **back up regularly**
- Keep GitHub Secrets secure - never commit them to the repository
- SSH key for deployment should be **deployment-only** (not your personal key)
- Monitor nginx logs for suspicious activity: `sudo tail -f /var/log/nginx/access.log`
- SSL certificates auto-renew via certbot (check: `sudo certbot renew --dry-run`)

---

## Support

If you encounter issues:

1. Check logs: `docker-compose logs -f`
2. Check GitHub Actions workflow logs
3. Review this guide's Troubleshooting section
4. Check CLAUDE.md for architecture details

**Happy deploying! 🚀**
