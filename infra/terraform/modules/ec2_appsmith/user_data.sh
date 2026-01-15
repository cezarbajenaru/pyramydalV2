#!/bin/bash
# EC2 User Data script for Appsmith installation
# Runs on first boot only

set -e

# Log output
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "Starting Appsmith installation at $(date)"

# Update system
dnf update -y

# Install Docker
dnf install -y docker
systemctl start docker
systemctl enable docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Mount EBS volume for persistent data
if [ -e /dev/xvdf ]; then
    echo "Setting up persistent data volume..."
    
    # Format if not already formatted
    if ! blkid /dev/xvdf; then
        mkfs -t ext4 /dev/xvdf
    fi
    
    # Create mount point
    mkdir -p /opt/appsmith
    
    # Add to fstab
    UUID=$(blkid -s UUID -o value /dev/xvdf)
    if ! grep -q "$UUID" /etc/fstab; then
        echo "UUID=$UUID /opt/appsmith ext4 defaults,nofail 0 2" >> /etc/fstab
    fi
    
    # Mount
    mount /opt/appsmith
fi

cd /opt/appsmith

# Create docker-compose.yml
cat > docker-compose.yml <<'EOF'
version: "3.8"

services:
  appsmith:
    image: appsmith/appsmith-ce:v1.9.56
    container_name: appsmith
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./stacks:/appsmith-stacks
    environment:
      # Encryption (CRITICAL: never change these after first setup!)
      APPSMITH_ENCRYPTION_PASSWORD: "${appsmith_encryption_password}"
      APPSMITH_ENCRYPTION_SALT: "${appsmith_encryption_salt}"
      
      # Database connection (for direct queries)
      PYRAMYDAL_DB_HOST: "${db_host}"
      PYRAMYDAL_DB_NAME: "${db_name}"
      PYRAMYDAL_DB_USER: "${db_user}"
      PYRAMYDAL_DB_PASSWORD: "${db_password}"
      
      # S3 bucket (for file uploads)
      PYRAMYDAL_S3_BUCKET: "${s3_bucket}"
      
      # Appsmith config
      APPSMITH_DISABLE_TELEMETRY: "true"
      APPSMITH_SIGNUP_DISABLED: "false"
EOF

# Create .env file (for docker-compose substitution)
cat > .env <<EOF
appsmith_encryption_password=${appsmith_encryption_password}
appsmith_encryption_salt=${appsmith_encryption_salt}
db_host=${db_host}
db_name=${db_name}
db_user=${db_user}
db_password=${db_password}
s3_bucket=${s3_bucket}
EOF

# Set secure permissions
chmod 600 .env

# Start Appsmith
docker-compose up -d

echo "Appsmith installation completed at $(date)"
echo "Access Appsmith at: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "IMPORTANT: Configure HTTPS via Let's Encrypt after DNS is set up"

