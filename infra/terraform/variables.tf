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
  default     = "db.t4g.small"  # 2 vCPU, 2 GB RAM - good for 75k rows
}

variable "ec2_instance_type" {
  description = "EC2 instance type for Appsmith"
  type        = string
  default     = "t3.medium"  # 2 vCPU, 4 GB RAM
}

variable "ec2_key_name" {
  description = "EC2 SSH key pair name"
  type        = string
}

variable "allowed_ips" {
  description = "List of IP addresses allowed to access Appsmith (CIDR notation)"
  type        = list(string)
  default     = []  # Must be provided for security
}

variable "appsmith_encryption_password" {
  description = "Appsmith encryption password (persistent!)"
  type        = string
  sensitive   = true
}

variable "appsmith_encryption_salt" {
  description = "Appsmith encryption salt (persistent!)"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for Appsmith (optional, for ACM certificate)"
  type        = string
  default     = ""
}

variable "enable_multi_az" {
  description = "Enable RDS Multi-AZ deployment"
  type        = bool
  default     = false  # Set true for production
}

variable "backup_retention_days" {
  description = "RDS backup retention period (days)"
  type        = number
  default     = 14  # 2 weeks for production
}

