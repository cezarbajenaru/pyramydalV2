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
  value     = <<-EOT
    
    ============================================
    PyramydalV2 Production Infrastructure Ready
    ============================================
    
    Next steps:
    
    1. Initialize database schema:
       psql -h ${module.rds.address} -U ${var.db_username} -d production -f schema.sql
    
    2. Test Lambda functions:
       aws lambda invoke --function-name ${module.lambda.recalc_function_name} /tmp/output.json
    
    3. Configure UI deployment endpoint (to be provisioned by UI stack)
       and point it to this RDS + Lambda infrastructure.
    
    S3 Bucket: ${module.s3.bucket_name}
    RDS Endpoint: ${module.rds.address}:5432
    
  EOT
  sensitive = true
}

