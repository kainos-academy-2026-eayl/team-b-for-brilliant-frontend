variable "subscription_id" {
  description = "Azure subscription ID containing the existing backend resource group."
  type        = string
}

variable "resource_group_name" {
  description = "Name of the existing Azure resource group shared with the backend."
  type        = string
  default     = "rg-brilliant-backend-dev"

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