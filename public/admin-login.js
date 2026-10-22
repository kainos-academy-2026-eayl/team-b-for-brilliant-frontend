"use strict";
(() => {
  // src/client/admin-login.ts
  var form = document.getElementById("login-form");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");
  var submitButton = document.getElementById("submit-button");
  var formError = document.getElementById("form-error");
  var COMPANY_DOMAIN = "@bebrilliant.com";
  function setError(input, message) {
    const errorElement = document.getElementById(`${input.id}-error`);
    if (errorElement) errorElement.textContent = message;
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }
  function getSafeNextUrl() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      try {
        const target = new URL(next, window.location.origin);
        if (target.origin === window.location.origin) return target.href;
      } catch {
        return "/admin/account";
      }
    }
    return "/admin/account";
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";
    setError(emailInput, "");
    setError(passwordInput, "");
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    let valid = true;
    if (!email) {
      setError(emailInput, "Enter your email.");
      valid = false;
    } else if (!email.endsWith(COMPANY_DOMAIN)) {
      setError(emailInput, "Use your company email address.");
      valid = false;
    }
    if (!password) {
      setError(passwordInput, "Enter your password.");
      valid = false;
    }
    if (!valid) return;
    submitButton.disabled = true;
    submitButton.textContent = "Signing in...";
    try {
      const apiBase = form.dataset.apiBaseUrl ?? "";
      const response = await fetch(`${apiBase}/api/v1/auth/admin/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (response.ok) {
        window.location.href = getSafeNextUrl();
        return;
      }
      if (response.status === 429) {
        formError.textContent = "Too many attempts. Please try again later.";
      } else if (response.status === 401) {
        const body = await response.json().catch(() => ({}));
        if (body.field === "email") {
          setError(emailInput, "No staff account found with that email.");
        } else if (body.field === "password") {
          setError(passwordInput, "Incorrect password.");
        } else {
          formError.textContent = "Invalid email or password.";
        }
      } else {
        formError.textContent = "Something went wrong. Please try again.";
      }
    } catch {
      formError.textContent = "Something went wrong. Please try again.";
    }
    submitButton.disabled = false;
    submitButton.textContent = "Sign in";
  });
})();
