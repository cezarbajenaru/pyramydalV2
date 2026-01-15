# Production Environment Outputs

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "rds_address" {
  description = "RDS PostgreSQL address"
  value       = module.rds.address
}

output "s3_bucket_name" {
  description = "S3 bucket name for file uploads"
  value       = module.s3.bucket_name
}

output "appsmith_public_ip" {
  description = "Appsmith EC2 public IP"
  value       = module.ec2_appsmith.public_ip
}

output "appsmith_url" {
  description = "Appsmith access URL"
  value       = "https://${module.ec2_appsmith.public_ip}"
}

output "import_lambda_function" {
  description = "Import Lambda function name"
  value       = module.lambda.import_function_name
}

output "recalc_lambda_function" {
  description = "Recalculation Lambda function name"
  value       = module.lambda.recalc_function_name
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

# Instructions for initial setup
output "setup_instructions" {
  value = <<-EOT
    
    ============================================
    PyramydalV2 Production Infrastructure Ready
    ============================================
    
    Next steps:
    
    1. SSH to Appsmith EC2:
       ssh -i ~/.ssh/${var.ec2_key_name}.pem ec2-user@${module.ec2_appsmith.public_ip}
    
    2. Check Appsmith status:
       cd /opt/appsmith && docker-compose ps
    
    3. Initialize database schema:
       psql -h ${module.rds.address} -U ${var.db_username} -d production -f schema.sql
    
    4. Access Appsmith UI:
       https://${module.ec2_appsmith.public_ip}
       (Create admin account on first visit)
    
    5. Configure DNS (optional):
       Point your domain to: ${module.ec2_appsmith.public_ip}
    
    6. Enable HTTPS:
       SSH to EC2 and run: certbot --nginx -d yourdomain.com
    
    7. Test Lambda functions:
       aws lambda invoke --function-name ${module.lambda.recalc_function_name} /tmp/output.json
    
    S3 Bucket: ${module.s3.bucket_name}
    RDS Endpoint: ${module.rds.address}:5432
    
  EOT
}

