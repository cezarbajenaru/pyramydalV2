# SQS Module with DLQ support

variable "name_prefix" {
  type = string
}

variable "max_receive_count" {
  description = "Messages moved to DLQ after this many receives"
  type        = number
  default     = 10
}

variable "visibility_timeout_seconds" {
  type    = number
  default = 30
}

variable "message_retention_seconds" {
  type    = number
  default = 345600 # 4 days
}

variable "dlq_message_retention_seconds" {
  type    = number
  default = 1209600 # 14 days
}

variable "allowed_principal_arns" {
  description = "IAM principal ARNs allowed to send/receive/delete/get attributes"
  type        = list(string)
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name_prefix}-dlq"
  message_retention_seconds = var.dlq_message_retention_seconds

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-dlq"
  })
}

resource "aws_sqs_queue" "main" {
  name                       = "${var.name_prefix}-queue"
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-queue"
  })
}

data "aws_iam_policy_document" "main_queue" {
  count = length(var.allowed_principal_arns) > 0 ? 1 : 0

  statement {
    sid    = "AllowConfiguredPrincipals"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = var.allowed_principal_arns
    }

    actions = [
      "sqs:SendMessage",
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility"
    ]

    resources = [aws_sqs_queue.main.arn]
  }
}

resource "aws_sqs_queue_policy" "main" {
  count = length(var.allowed_principal_arns) > 0 ? 1 : 0

  queue_url = aws_sqs_queue.main.id
  policy    = data.aws_iam_policy_document.main_queue[0].json
}

output "queue_id" {
  value = aws_sqs_queue.main.id
}

output "queue_name" {
  value = aws_sqs_queue.main.name
}

output "queue_arn" {
  value = aws_sqs_queue.main.arn
}

output "dlq_id" {
  value = aws_sqs_queue.dlq.id
}

output "dlq_name" {
  value = aws_sqs_queue.dlq.name
}

output "dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}