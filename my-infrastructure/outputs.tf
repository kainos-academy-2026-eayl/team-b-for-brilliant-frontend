output "resource_group_name" {
  description = "Name of the Azure resource group shared with the backend."
  value       = data.azurerm_resource_group.frontend.name
}

output "resource_group_id" {
  description = "Azure resource ID of the resource group shared with the backend."
  value       = data.azurerm_resource_group.frontend.id
}

output "resource_group_location" {
  description = "Azure region containing the resource group shared with the backend."
  value       = data.azurerm_resource_group.frontend.location
}