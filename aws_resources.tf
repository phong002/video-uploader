
provider "aws" {
  region = "ap-southeast-2"
}

# Create S3 Bucket
resource "aws_s3_bucket" "n11452331_bucket" {
  bucket = "n11452331-s3-bucket"
  acl    = "public-read"

  tags = {
    qut-username = "n11452331@qut.edu.au"
    purpose      = "assessment-2"
  }
}

# Create DynamoDB Table
resource "aws_dynamodb_table" "n11452331_table" {
  name           = "n11452331-table"
  billing_mode   = "PAY_PER_REQUEST"  # On-demand capacity

  hash_key = "qut-username"           # Partition key
  range_key = "n11452331-sort-key"    # Sort key

  attribute {
    name = "qut-username"
    type = "S"
  }

  attribute {
    name = "n11452331-sort-key"
    type = "S"
  }

  tags = {
    qut-username = "n11452331@qut.edu.au"
    purpose      = "assessment-2"
  }
}
