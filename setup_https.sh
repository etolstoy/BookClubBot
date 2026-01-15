#!/bin/bash

# BookClubBot HTTPS Setup Script (Nginx + Certbot)
# Usage: ./setup_https.sh your-domain.com

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "Usage: ./setup_https.sh <your-domain.com>"
    exit 1
fi

echo "🚀 Setting up HTTPS for $DOMAIN..."

# 1. Install Nginx and Certbot
echo "📦 Installing Nginx and Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Create Nginx Config
echo "⚙️ Creating Nginx configuration..."
CONFIG_FILE="/etc/nginx/sites-available/bookclub-bot"

sudo bash -c "cat > $CONFIG_FILE" <<EOF
server {
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# 3. Enable Site
echo "🔗 Enabling site..."
sudo ln -sf $CONFIG_FILE /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 4. Obtain SSL Certificate
echo "🔒 Obtaining SSL certificate..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN --redirect

echo "✅ HTTPS Setup Complete!"
echo "🌍 Your app is live at https://$DOMAIN"
