# ── VPC ──────────────────────────────────────────────────────────────────────
output "vpc_id" {
  value       = module.vpc.vpc_id
  description = "VPC ID"
}

output "vpc_cidr" {
  value       = module.vpc.vpc_cidr_block
  description = "VPC CIDR block"
}

# ── Subnets ───────────────────────────────────────────────────────────────────
output "public_subnet_ids" {
  value       = module.vpc.public_subnets
  description = "Public subnet IDs (one per AZ)"
}

output "private_subnet_ids" {
  value       = module.vpc.private_subnets
  description = "PrivateApp subnet IDs — PRIVATE_WITH_EGRESS (ECS, ALB targets)"
}

output "isolated_subnet_ids" {
  value       = module.vpc.intra_subnets
  description = "PrivateData subnet IDs — PRIVATE_ISOLATED (RDS)"
}

# ── Security Groups ───────────────────────────────────────────────────────────
output "alb_sg_id" {
  value       = try(aws_security_group.alb[0].id, null)
  description = "ALB security group ID (null for shared env)"
}

output "ecs_sg_id" {
  value       = try(aws_security_group.ecs[0].id, null)
  description = "ECS security group ID (null for shared env)"
}

output "rds_sg_id" {
  value       = try(aws_security_group.rds[0].id, null)
  description = "RDS security group ID (null for shared env)"
}
