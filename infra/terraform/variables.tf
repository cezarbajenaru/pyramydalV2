# Terraform Variables

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-central-1"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod"
  }
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "admin"
  sensitive   = true
}

variable "db_password" {
  description = "RDS master password (use SSM or Secrets Manager in production)"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.small" # 2 vCPU, 2 GB RAM - good for 75k rows
}

variable "domain_name" {
  description = "Optional domain name for UI/API endpoints"
  type        = string
  default     = ""
}

variable "enable_multi_az" {
  description = "Enable RDS Multi-AZ deployment"
  type        = bool
  default     = false # Set true for production
}

variable "backup_retention_days" {
  description = "RDS backup retention period (days)"
  type        = number
  default     = 14 # 2 weeks for production
}


# SQS variables for localstack deployment
variable "use_localstack_for_sqs" {
  description = "If true, create SQS resources in LocalStack instead of AWS"
  type        = bool
  default     = false
}

variable "localstack_endpoint" {
  description = "LocalStack endpoint URL"
  type        = string
  default     = "http://localhost:4566"
}

