# ── Local backend for initial testing ────────────────────────────────────────
# State is stored locally. Switch to S3 when ready for team/CI use:
#
# terraform {
#   backend "s3" {
#     bucket         = "ds-terraform-state"
#     key            = "ds-app-infra/dev/network.tfstate"
#     region         = "ap-southeast-2"
#     dynamodb_table = "ds-terraform-locks"
#     encrypt        = true
#   }
# }

terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
