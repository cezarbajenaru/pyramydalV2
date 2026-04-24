# PyramydalV2 - Root Terraform Configuration
# Infrastructure as Code for Excel replacement platform

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "s3" {
    # Configure via backend-config during init:
    # terraform init -backend-config="bucket=pyramydal-terraform-state" \
    #                -backend-config="key=prod/terraform.tfstate" \
    #                -backend-config="region=eu-central-1"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "PyramydalV2"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Localstack provider for SQS deployment
#
provider "aws" {
  alias  = "localstack"
  region = var.aws_region

  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    sqs = var.localstack_endpoint
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Local variables
locals {
  name_prefix = "pyramydal-${var.environment}"

  common_tags = {
    Project     = "PyramydalV2"
    Environment = var.environment
  }
}

module "vpc" {
  source = "./modules/vpc"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
  tags               = local.common_tags
}

module "s3" {
  source = "./modules/s3"

  name_prefix = local.name_prefix
  tags        = local.common_tags
}

module "lambda" {
  source = "./modules/lambda"

  name_prefix           = local.name_prefix
  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.private_subnet_ids
  rds_security_group_id = module.rds.security_group_id
  s3_bucket_name        = module.s3.bucket_name
  s3_bucket_arn         = module.s3.bucket_arn
  db_host               = module.rds.address
  db_name               = var.environment
  db_user               = var.db_username
  db_password           = var.db_password
  tags                  = local.common_tags
}

module "rds" {
  source = "./modules/rds"

  name_prefix             = local.name_prefix
  vpc_id                  = module.vpc.vpc_id
  subnet_ids              = module.vpc.private_subnet_ids
  allowed_security_groups = [module.lambda.lambda_security_group_id]
  database_name           = var.environment
  master_username         = var.db_username
  master_password         = var.db_password
  instance_class          = var.db_instance_class
  multi_az                = var.enable_multi_az
  backup_retention_period = var.backup_retention_days
  tags                    = local.common_tags
}

module "sqs" {
  count  = var.use_localstack_for_sqs ? 0 : 1
  source = "./modules/sqs"

  name_prefix            = local.name_prefix
  allowed_principal_arns = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
  tags                   = local.common_tags
}

module "sqs_localstack" {
  count     = var.use_localstack_for_sqs ? 1 : 0
  source    = "./modules/sqs"
  providers = { aws = aws.localstack }

  name_prefix            = local.name_prefix
  allowed_principal_arns = []
  tags                   = local.common_tags
}

