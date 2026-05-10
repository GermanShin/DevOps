data "aws_availability_zones" "available" {
  state = "available"
}

# ── VPC ───────────────────────────────────────────────────────────────────────
# Mirrors CDK ec2.Vpc with 3 subnet tiers (Public /24, PrivateApp /24, PrivateData /24)
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.env_name}-vpc"
  cidr = var.vpc_cidr

  azs = slice(data.aws_availability_zones.available.names, 0, var.max_azs)

  # Public /24 — one per AZ
  public_subnets = [for i in range(var.max_azs) : cidrsubnet(var.vpc_cidr, 8, i)]

  # PrivateApp /24 — PRIVATE_WITH_EGRESS (ECS tasks, routed through NAT)
  private_subnets = [for i in range(var.max_azs) : cidrsubnet(var.vpc_cidr, 8, i + var.max_azs)]

  # PrivateData /24 — PRIVATE_ISOLATED (RDS, no internet route)
  intra_subnets = [for i in range(var.max_azs) : cidrsubnet(var.vpc_cidr, 8, i + var.max_azs * 2)]

  enable_nat_gateway     = var.nat_gateways > 0
  single_nat_gateway     = var.nat_gateways == 1
  one_nat_gateway_per_az = var.nat_gateways > 1

  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = var.tags
}

# ── VPC Endpoint Security Group ───────────────────────────────────────────────
# Interface endpoints require a SG allowing HTTPS inbound from within the VPC
resource "aws_security_group" "vpc_endpoints" {
  count = var.env_name == "dev" ? 1 : 0

  name        = "${var.env_name}-vpc-endpoints-sg"
  description = "Allow HTTPS from VPC CIDR to interface endpoints"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "HTTPS from VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.env_name}-vpc-endpoints-sg" })
}

# ── VPC Interface Endpoints (dev only) ───────────────────────────────────────
# Allows ECS tasks in private subnets to reach AWS services
# without going through the NAT Gateway — mirrors CDK addInterfaceEndpoint calls
locals {
  interface_endpoints = var.env_name == "dev" ? {
    ecr_api         = "com.amazonaws.${var.region}.ecr.api"
    ecr_dkr         = "com.amazonaws.${var.region}.ecr.dkr"
    cloudwatch_logs = "com.amazonaws.${var.region}.logs"
    secrets_manager = "com.amazonaws.${var.region}.secretsmanager"
  } : {}
}

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoints

  vpc_id              = module.vpc.vpc_id
  service_name        = each.value
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(var.tags, { Name = "${var.env_name}-${replace(each.key, "_", "-")}-endpoint" })
}

# ── S3 Gateway Endpoint (dev only) ───────────────────────────────────────────
# ECR uses S3 for image layers — Gateway endpoint is free
resource "aws_vpc_endpoint" "s3" {
  count = var.env_name == "dev" ? 1 : 0

  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids

  tags = merge(var.tags, { Name = "${var.env_name}-s3-endpoint" })
}

# ── ALB Security Group ────────────────────────────────────────────────────────
resource "aws_security_group" "alb" {
  count = var.env_name != "shared" ? 1 : 0

  name        = "${var.env_name}-alb-sg"
  description = "ALB - public HTTPS and HTTP redirect"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP redirect"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.env_name}-alb-sg" })
}

# ── ECS Security Group ────────────────────────────────────────────────────────
resource "aws_security_group" "ecs" {
  count = var.env_name != "shared" ? 1 : 0

  name        = "${var.env_name}-ecs-sg"
  description = "ECS tasks - inbound from ALB only"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = var.ecs_app_port
    to_port         = var.ecs_app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb[0].id]
    description     = "From ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.env_name}-ecs-sg" })
}

# ── RDS Security Group ────────────────────────────────────────────────────────
# allowAllOutbound: false in CDK — no egress block here intentionally
resource "aws_security_group" "rds" {
  count = var.env_name != "shared" ? 1 : 0

  name        = "${var.env_name}-rds-sg"
  description = "RDS - inbound from ECS only"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs[0].id]
    description     = "PostgreSQL from ECS"
  }

  dynamic "ingress" {
    for_each = var.tgw_shared_vpc_cidr != "" ? [1] : []
    content {
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = [var.tgw_shared_vpc_cidr]
      description = "PostgreSQL from Shared VPC via TGW"
    }
  }

  tags = merge(var.tags, { Name = "${var.env_name}-rds-sg" })
}
