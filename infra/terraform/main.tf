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

