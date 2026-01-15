# Lambda Module for Import and Recalculation functions

variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "rds_security_group_id" {
  type = string
}

variable "s3_bucket_name" {
  type = string
}

variable "s3_bucket_arn" {
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

variable "tags" {
  type    = map(string)
  default = {}
}

# Security Group for Lambda
resource "aws_security_group" "lambda" {
  name        = "${var.name_prefix}-lambda-sg"
  description = "Security group for Lambda functions"
  vpc_id      = var.vpc_id
  
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-lambda-sg"
  })
}

# Allow Lambda to connect to RDS
resource "aws_security_group_rule" "lambda_to_rds" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda.id
  security_group_id        = var.rds_security_group_id
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda" {
  name = "${var.name_prefix}-lambda-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
  
  tags = var.tags
}

# Lambda basic execution policy (logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda VPC execution policy
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# S3 access policy for Lambda
resource "aws_iam_role_policy" "lambda_s3" {
  name = "${var.name_prefix}-lambda-s3-policy"
  role = aws_iam_role.lambda.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.s3_bucket_arn,
          "${var.s3_bucket_arn}/*"
        ]
      }
    ]
  })
}

# CloudWatch Logs for Lambda
resource "aws_cloudwatch_log_group" "import_lambda" {
  name              = "/aws/lambda/${var.name_prefix}-import"
  retention_in_days = 30
  
  tags = var.tags
}

resource "aws_cloudwatch_log_group" "recalc_lambda" {
  name              = "/aws/lambda/${var.name_prefix}-recalc"
  retention_in_days = 30
  
  tags = var.tags
}

# Lambda Function: Import Reference Data
resource "aws_lambda_function" "import_reference" {
  filename         = "${path.module}/../../../lambda/import_reference/package.zip"
  function_name    = "${var.name_prefix}-import"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.11"
  timeout          = 300  # 5 minutes (XLSX parsing can be slow)
  memory_size      = 512
  
  source_code_hash = fileexists("${path.module}/../../../lambda/import_reference/package.zip") ? filebase64sha256("${path.module}/../../../lambda/import_reference/package.zip") : null
  
  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }
  
  environment {
    variables = {
      DB_HOST     = var.db_host
      DB_NAME     = var.db_name
      DB_USER     = var.db_user
      DB_PASSWORD = var.db_password
      S3_BUCKET   = var.s3_bucket_name
    }
  }
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-import"
  })
  
  depends_on = [
    aws_cloudwatch_log_group.import_lambda
  ]
}

# Lambda Function: Recalculation
resource "aws_lambda_function" "recalc" {
  filename         = "${path.module}/../../../lambda/recalc/package.zip"
  function_name    = "${var.name_prefix}-recalc"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.11"
  timeout          = 180  # 3 minutes
  memory_size      = 256
  
  source_code_hash = fileexists("${path.module}/../../../lambda/recalc/package.zip") ? filebase64sha256("${path.module}/../../../lambda/recalc/package.zip") : null
  
  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }
  
  environment {
    variables = {
      DB_HOST     = var.db_host
      DB_NAME     = var.db_name
      DB_USER     = var.db_user
      DB_PASSWORD = var.db_password
    }
  }
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-recalc"
  })
  
  depends_on = [
    aws_cloudwatch_log_group.recalc_lambda
  ]
}

# EventBridge Rule: Scheduled Recalculation (every 15 minutes)
resource "aws_cloudwatch_event_rule" "recalc_schedule" {
  name                = "${var.name_prefix}-recalc-schedule"
  description         = "Trigger recalculation every 15 minutes"
  schedule_expression = "rate(15 minutes)"
  
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "recalc_lambda" {
  rule      = aws_cloudwatch_event_rule.recalc_schedule.name
  target_id = "RecalcLambda"
  arn       = aws_lambda_function.recalc.arn
  
  input = jsonencode({
    triggered_by = "scheduled"
  })
}

# Permission for EventBridge to invoke Lambda
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.recalc.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.recalc_schedule.arn
}

# CloudWatch Alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "import_errors" {
  alarm_name          = "${var.name_prefix}-import-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Alert when import Lambda has errors"
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    FunctionName = aws_lambda_function.import_reference.function_name
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "recalc_errors" {
  alarm_name          = "${var.name_prefix}-recalc-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 900
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when recalc Lambda has errors"
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    FunctionName = aws_lambda_function.recalc.function_name
  }
  
  tags = var.tags
}

# Outputs
output "import_function_name" {
  value = aws_lambda_function.import_reference.function_name
}

output "import_function_arn" {
  value = aws_lambda_function.import_reference.arn
}

output "recalc_function_name" {
  value = aws_lambda_function.recalc.function_name
}

output "recalc_function_arn" {
  value = aws_lambda_function.recalc.arn
}

output "lambda_security_group_id" {
  value = aws_security_group.lambda.id
}

