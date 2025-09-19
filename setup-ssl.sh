# Buat direktori yang diperlukan untuk certbot
mkdir -p certbot/conf
mkdir -p certbot/www

# Buat direktori untuk konfigurasi SSL nginx
mkdir -p nginx/ssl

# Buat file konfigurasi SSL dasar untuk nginx
cat > nginx/ssl/options-ssl-nginx.conf << 'EOF'
# This file contains important security parameters. If you modify this file manually,
# Certbot will be unable to automatically provide future security updates.
# Instead, Certbot will print and log an error message with a URL to visit to
# update your configuration.

ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;

ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384";
EOF

# Buat file DH parameters (jika diperlukan)
# openssl dhparam -out nginx/ssl/ssl-dhparams.pem 2048