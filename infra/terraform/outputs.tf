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

output "sqs_queue_name" {
  description = "Primary SQS queue name"
  value       = var.use_localstack_for_sqs ? module.sqs_localstack[0].queue_name : module.sqs[0].queue_name
}

output "sqs_queue_arn" {
  description = "Primary SQS queue ARN"
  value       = var.use_localstack_for_sqs ? module.sqs_localstack[0].queue_arn : module.sqs[0].queue_arn
}

output "sqs_dlq_name" {
  description = "Dead-letter queue name"
  value       = var.use_localstack_for_sqs ? module.sqs_localstack[0].dlq_name : module.sqs[0].dlq_name
}
