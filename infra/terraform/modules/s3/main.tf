# S3 Bucket Module for file storage

variable "name_prefix" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

# S3 Bucket
resource "aws_s3_bucket" "main" {
  bucket = "${var.name_prefix}-files"
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-files"
  })
}

# Versioning (critical for rollback capability)
resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rules (optional cleanup)
resource "aws_s3_bucket_lifecycle_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  
  # Keep old versions for 90 days
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
  
  # Clean up incomplete multipart uploads
  rule {
    id     = "cleanup-incomplete-uploads"
    status = "Enabled"
    
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Folder structure (using empty objects as markers)
resource "aws_s3_object" "folders" {
  for_each = toset([
    "uploads/lista_programe/",
    "uploads/price_list/",
    "uploads/timing_list/",
    "uploads/cnc_times/",
    "exports/"
  ])
  
  bucket  = aws_s3_bucket.main.id
  key     = each.value
  content = ""
}

# Outputs
output "bucket_id" {
  value = aws_s3_bucket.main.id
}

output "bucket_arn" {
  value = aws_s3_bucket.main.arn
}

output "bucket_name" {
  value = aws_s3_bucket.main.bucket
}

