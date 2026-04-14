# Link to root variables
# This allows using the same variable definitions

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_cidr" {
  type = string
}

variable "db_username" {
  type      = string
  sensitive = true
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "db_instance_class" {
  type = string
}

variable "domain_name" {
  type    = string
  default = ""
}

variable "enable_multi_az" {
  type = bool
}

variable "backup_retention_days" {
  type = number
}

