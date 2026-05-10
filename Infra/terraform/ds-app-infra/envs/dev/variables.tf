variable "env_name" {
  type = string
}

variable "region" {
  type = string
}

variable "profile" {
  type        = string
  description = "AWS SSO profile name from ~/.aws/config"
}

variable "vpc_cidr" {
  type = string
}

variable "max_azs" {
  type = number
}

variable "nat_gateways" {
  type = number
}

variable "ecs_app_port" {
  type = number
}

variable "tgw_shared_vpc_cidr" {
  type = string
}
