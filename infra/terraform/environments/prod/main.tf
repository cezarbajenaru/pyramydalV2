# Production Environment Configuration

terraform {
  backend "s3" {
    # Configure during init:
    # terraform init -backend-config="bucket=pyramydal-terraform-state" \
    #                -backend-config="key=prod/terraform.tfstate" \
    #                -backend-config="region=eu-central-1"
  }
}

module "vpc" {
  source = "../../modules/vpc"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
  tags               = local.common_tags
}

module "s3" {
  source = "../../modules/s3"

  name_prefix = local.name_prefix
  tags        = local.common_tags
}

module "rds" {
  source = "../../modules/rds"

  name_prefix             = local.name_prefix
  vpc_id                  = module.vpc.vpc_id
  subnet_ids              = module.vpc.private_subnet_ids
  allowed_security_groups = [module.lambda.lambda_security_group_id]
  database_name           = "production"
  master_username         = var.db_username
  master_password         = var.db_password
  instance_class          = var.db_instance_class
  multi_az                = var.enable_multi_az
  backup_retention_period = var.backup_retention_days
  tags                    = local.common_tags
}

module "lambda" {
  source = "../../modules/lambda"

  name_prefix           = local.name_prefix
  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.private_subnet_ids
  rds_security_group_id = module.rds.security_group_id
  s3_bucket_name        = module.s3.bucket_name
  s3_bucket_arn         = module.s3.bucket_arn
  db_host               = module.rds.address
  db_name               = module.rds.database_name
  db_user               = var.db_username
  db_password           = var.db_password
  tags                  = local.common_tags
}

# Locals from root main.tf
locals {
  name_prefix = "pyramydal-${var.environment}"

  common_tags = {
    Project     = "PyramydalV2"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

