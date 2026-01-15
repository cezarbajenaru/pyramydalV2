# EC2 Module for Appsmith (self-hosted)

variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

variable "key_name" {
  type = string
}

variable "allowed_cidr_blocks" {
  type        = list(string)
  description = "IP addresses allowed to access Appsmith"
}

variable "rds_security_group_id" {
  type = string
}

variable "s3_bucket_name" {
  type = string
}

variable "db_host" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_user" {
  type      = string
  sensitive = true
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "appsmith_encryption_password" {
  type      = string
  sensitive = true
}

variable "appsmith_encryption_salt" {
  type      = string
  sensitive = true
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Security Group for Appsmith EC2
resource "aws_security_group" "appsmith" {
  name        = "${var.name_prefix}-appsmith-sg"
  description = "Security group for Appsmith EC2"
  vpc_id      = var.vpc_id
  
  # HTTPS access from allowed IPs
  ingress {
    description = "HTTPS from allowed IPs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }
  
  # HTTP access (for Let's Encrypt challenge)
  ingress {
    description = "HTTP for Let's Encrypt"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }
  
  # SSH access from allowed IPs
  ingress {
    description = "SSH from allowed IPs"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }
  
  # Allow all outbound
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-appsmith-sg"
  })
}

# IAM Role for EC2
resource "aws_iam_role" "appsmith" {
  name = "${var.name_prefix}-appsmith-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
  
  tags = var.tags
}

# IAM Policy for S3 access
resource "aws_iam_role_policy" "appsmith_s3" {
  name = "${var.name_prefix}-appsmith-s3-policy"
  role = aws_iam_role.appsmith.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}",
          "arn:aws:s3:::${var.s3_bucket_name}/*"
        ]
      }
    ]
  })
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "appsmith" {
  name = "${var.name_prefix}-appsmith-profile"
  role = aws_iam_role.appsmith.name
  
  tags = var.tags
}

# Get latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]
  
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# EBS Volume for Appsmith data (persistent!)
resource "aws_ebs_volume" "appsmith_data" {
  availability_zone = data.aws_availability_zone.selected.name
  size              = 50  # GB
  type              = "gp3"
  encrypted         = true
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-appsmith-data"
    Backup = "daily"  # Tag for backup automation
  })
}

data "aws_availability_zone" "selected" {
  name = data.aws_subnet.selected.availability_zone
}

data "aws_subnet" "selected" {
  id = var.subnet_id
}

# User data script for EC2 initialization
data "template_file" "user_data" {
  template = file("${path.module}/user_data.sh")
  
  vars = {
    db_host                      = var.db_host
    db_name                      = var.db_name
    db_user                      = var.db_user
    db_password                  = var.db_password
    s3_bucket                    = var.s3_bucket_name
    appsmith_encryption_password = var.appsmith_encryption_password
    appsmith_encryption_salt     = var.appsmith_encryption_salt
  }
}

# EC2 Instance
resource "aws_instance" "appsmith" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.appsmith.id]
  key_name               = var.key_name
  iam_instance_profile   = aws_iam_instance_profile.appsmith.name
  
  user_data = data.template_file.user_data.rendered
  
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    delete_on_termination = true
  }
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-appsmith"
  })
}

# Attach EBS volume
resource "aws_volume_attachment" "appsmith_data" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.appsmith_data.id
  instance_id = aws_instance.appsmith.id
}

# Elastic IP (optional but recommended for stable access)
resource "aws_eip" "appsmith" {
  domain   = "vpc"
  instance = aws_instance.appsmith.id
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-appsmith-eip"
  })
}

# Outputs
output "instance_id" {
  value = aws_instance.appsmith.id
}

output "public_ip" {
  value = aws_eip.appsmith.public_ip
}

output "security_group_id" {
  value = aws_security_group.appsmith.id
}

output "iam_role_arn" {
  value = aws_iam_role.appsmith.arn
}

