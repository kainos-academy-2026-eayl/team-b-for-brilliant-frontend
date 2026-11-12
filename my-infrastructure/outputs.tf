output "resource_group_name" {
  description = "Name of the frontend Azure resource group."
  value       = azurerm_resource_group.frontend.name
}

output "resource_group_id" {
  description = "Azure resource ID of the frontend resource group."
  value       = azurerm_resource_group.frontend.id
}

output "resource_group_location" {
  description = "Azure region containing the frontend resource group."
  value       = azurerm_resource_group.frontend.location
}