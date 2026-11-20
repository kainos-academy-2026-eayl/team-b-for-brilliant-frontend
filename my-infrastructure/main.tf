terraform {
  backend "azurerm" {
    storage_account_name = "teamb4brilliant"
    container_name       = "tfstate"
    key                  = "brilliant-frontend-dev.tfstate"

    use_azuread_auth = true
    use_cli          = true
  }

  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

data "azurerm_resource_group" "frontend" {
  name = var.resource_group_name
}
