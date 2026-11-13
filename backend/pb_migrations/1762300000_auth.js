/// <reference path="../pb_data/types.d.ts" />

// Auth contract for the built-in `users` collection.
// - Signup is closed: accounts are created by the operator in the dashboard.
// - Email + password is the only sign-in method. OTP, OAuth2 and MFA stay off
//   (no SMTP sender or OAuth provider is configured on the host).
// - A user can see and edit only their own account and cannot delete it from the app.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";
    users.createRule = null;
    users.updateRule = "id = @request.auth.id";
    users.deleteRule = null;

    users.passwordAuth.enabled = true;
    users.passwordAuth.identityFields = ["email"];
    users.otp.enabled = false;
    users.mfa.enabled = false;
    users.oauth2.enabled = false;

    app.save(users);
  },
  (app) => {
    // Restore PocketBase's defaults for a fresh `users` collection.
    const users = app.findCollectionByNameOrId("users");
    users.createRule = "";
    users.deleteRule = "id = @request.auth.id";
    app.save(users);
  },
);
