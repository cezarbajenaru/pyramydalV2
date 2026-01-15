# Appsmith Persistent Volumes Guide

## Critical Information

⚠️ **NEVER DELETE VOLUMES** - Deleting volumes will lose all Appsmith data including:
- User accounts and passwords
- All applications and pages
- Datasource configurations
- Git connections
- Custom plugins

## Volume Structure

```
/var/lib/docker/volumes/appsmith_data/_data/
├── configuration/          # Appsmith instance configuration
├── data/                   # MongoDB data (internal Appsmith DB)
│   └── mongodb/
├── logs/                   # Application logs
├── certificates/           # SSL certificates
└── themes/                 # Custom themes
```

## Backup Strategy

### Manual Backup

```bash
# SSH to EC2 instance
ssh -i your-key.pem ec2-user@<appsmith-ip>

# Create backup
cd /opt/appsmith
sudo tar -czf appsmith-backup-$(date +%Y%m%d-%H%M%S).tar.gz stacks/

# Copy to S3
aws s3 cp appsmith-backup-*.tar.gz s3://pyramydal-prod-files/backups/
```

### Automated Backup (via cron)

```bash
# Add to crontab (daily at 2 AM)
0 2 * * * /opt/appsmith/backup.sh

# /opt/appsmith/backup.sh
#!/bin/bash
cd /opt/appsmith
BACKUP_FILE="appsmith-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
sudo tar -czf /tmp/$BACKUP_FILE stacks/
aws s3 cp /tmp/$BACKUP_FILE s3://pyramydal-prod-files/backups/$BACKUP_FILE
rm /tmp/$BACKUP_FILE

# Keep only last 30 days of backups
aws s3 ls s3://pyramydal-prod-files/backups/ | while read -r line; do
    createDate=$(echo $line | awk '{print $1" "$2}')
    createDate=$(date -d "$createDate" +%s)
    olderThan=$(date -d "30 days ago" +%s)
    if [[ $createDate -lt $olderThan ]]; then
        fileName=$(echo $line | awk '{print $4}')
        aws s3 rm s3://pyramydal-prod-files/backups/$fileName
    fi
done
```

### EBS Snapshot Backup

```bash
# Create EBS snapshot (via AWS CLI)
VOLUME_ID=$(aws ec2 describe-volumes \
  --filters "Name=tag:Name,Values=pyramydal-prod-appsmith-data" \
  --query 'Volumes[0].VolumeId' \
  --output text)

aws ec2 create-snapshot \
  --volume-id $VOLUME_ID \
  --description "Appsmith data backup $(date +%Y%m%d-%H%M%S)" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=pyramydal-appsmith-backup}]"
```

## Restore from Backup

### Restore from tar.gz

```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@<appsmith-ip>

# Stop Appsmith
cd /opt/appsmith
sudo docker-compose down

# Download backup from S3
aws s3 cp s3://pyramydal-prod-files/backups/appsmith-backup-YYYYMMDD-HHMMSS.tar.gz /tmp/

# Extract (will overwrite existing data!)
sudo tar -xzf /tmp/appsmith-backup-*.tar.gz -C /opt/appsmith/

# Start Appsmith
sudo docker-compose up -d

# Verify
sudo docker-compose logs -f
```

### Restore from EBS Snapshot

1. Stop EC2 instance
2. Detach current EBS volume
3. Create new volume from snapshot
4. Attach new volume to EC2 at `/dev/xvdf`
5. Start EC2 instance
6. Mount volume: `sudo mount /dev/xvdf /opt/appsmith`

## Volume Upgrade Strategy

When upgrading Appsmith:

```bash
# 1. Create backup FIRST
sudo tar -czf /tmp/pre-upgrade-backup.tar.gz /opt/appsmith/stacks/

# 2. Update docker-compose.yml with new version
sudo sed -i 's/appsmith-ce:v.*/appsmith-ce:v1.9.60/' docker-compose.yml

# 3. Pull new image
sudo docker-compose pull

# 4. Restart (volumes persist automatically)
sudo docker-compose up -d

# 5. Check logs for migration messages
sudo docker-compose logs -f
```

## Encryption Keys

⚠️ **CRITICAL: Encryption keys must NEVER change after first setup!**

```bash
# Check current encryption keys (stored in .env)
cat /opt/appsmith/.env | grep ENCRYPTION

# These keys encrypt:
# - Datasource credentials
# - API keys
# - OAuth tokens
# - Git SSH keys
```

If encryption keys are lost or changed:
- All encrypted data becomes unrecoverable
- Must reconfigure all datasources
- Must reconnect all Git repositories

## Monitoring Volume Usage

```bash
# Check volume size
df -h /opt/appsmith

# Check Docker volume details
docker volume inspect appsmith_data

# Monitor growth over time
du -sh /var/lib/docker/volumes/appsmith_data/_data/
```

## Troubleshooting

### Volume not mounting after reboot

```bash
# Check fstab entry
cat /etc/fstab | grep appsmith

# Manual mount
sudo mount /dev/xvdf /opt/appsmith

# Verify
df -h | grep appsmith
```

### Container won't start after volume restore

```bash
# Check permissions
sudo chown -R 1000:1000 /opt/appsmith/stacks/

# Restart
sudo docker-compose up -d
```

### Out of disk space

```bash
# Check usage
df -h /opt/appsmith

# Clean Docker cache (safe)
sudo docker system prune -a

# Resize EBS volume (if needed)
# 1. Modify volume size in AWS Console
# 2. Grow filesystem:
sudo growpart /dev/xvdf 1
sudo resize2fs /dev/xvdf
```

