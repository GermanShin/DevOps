variable "env_name" {
  type        = string
  description = "Environment name: dev | shared | prod"
}

variable "region" {
  type        = string
  description = "AWS region"
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block"
}

variable "max_azs" {
  type        = number
  description = "Number of AZs to use"
}

variable "nat_gateways" {
  type        = number
  description = "Number of NAT Gateways: 0 for shared, 1 for dev, 2 for prod"
}

variable "ecs_app_port" {
  type        = number
  default     = 0
  description = "Port ECS tasks listen on (e.g. 8080 for Spring Boot)"
}

variable "tgw_shared_vpc_cidr" {
  type        = string
  default     = ""
  description = "Shared VPC CIDR — used to allow RDS access from the shared account via TGW"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources"
}
