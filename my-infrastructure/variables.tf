variable "subscription_id" {
  description = "Azure subscription ID where the resource group will be created."
  type        = string
}

variable "resource_group_name" {
  description = "Name for the frontend Azure resource group."
  type        = string
  default     = "rg-brilliant-frontend-dev"

  validation {
    condition = (
      length(var.resource_group_name) >= 1 &&
      length(var.resource_group_name) <= 90 &&
      can(regex("^[A-Za-z0-9._()-]+$", var.resource_group_name)) &&
      !endswith(var.resource_group_name, ".")
    )
    error_message = "Use 1-90 letters, numbers, periods, underscores, parentheses, or hyphens; the name cannot end with a period."
  }
}

variable "location" {
  description = "Azure region for the resource group, such as uksouth or eastus."
  type        = string
  default     = "uksouth"
}

variable "environment" {
  description = "Deployment environment used to tag the resource group."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "environment must be dev, test, or prod."
  }
}