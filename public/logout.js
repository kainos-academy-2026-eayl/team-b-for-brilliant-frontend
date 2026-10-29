"use strict";
(() => {
  // src/client/logout.ts
  var logoutButton = document.getElementById("logout-button");
  var apiBase = logoutButton.dataset.apiBaseUrl ?? "";
  logoutButton.addEventListener("click", async () => {
    try {
      const response = await fetch(`${apiBase}/api/v1/auth/admin/logout`, {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) throw new Error("Logout failed");
    } catch {
      window.alert("Unable to log out. Please try again.");
      return;
    }
    window.location.href = "/admin/login";
  });
})();
