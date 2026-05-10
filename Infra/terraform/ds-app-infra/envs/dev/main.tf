provider "aws" {
  region  = var.region
  profile = var.profile
}

module "network" {
  source = "../../modules/network"

  env_name            = var.env_name
  region              = var.region
  vpc_cidr            = var.vpc_cidr
  max_azs             = var.max_azs
  nat_gateways        = var.nat_gateways
  ecs_app_port        = var.ecs_app_port
  tgw_shared_vpc_cidr = var.tgw_shared_vpc_cidr

  tags = {
    Environment = var.env_name
    Owner       = "Dylan.Shin"
    Project     = "ds-app"
  }
}

# ── Outputs — mirrors NetworkStack public readonly properties ─────────────────
output "vpc_id" {
  value = module.network.vpc_id
}

output "alb_sg_id" {
  value = module.network.alb_sg_id
}

output "ecs_sg_id" {
  value = module.network.ecs_sg_id
}

output "rds_sg_id" {
  value = module.network.rds_sg_id
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "isolated_subnet_ids" {
  value = module.network.isolated_subnet_ids
}
