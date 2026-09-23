# Fixture workspace

A two-file workspace that declares pnpm and nothing else. It exists so a case about "the acceptance
command names a package manager the package does not use" can be decided by running the check,
instead of by arguing about whether the rule could ever fire.

It is a fixture. No product depends on it and nothing here is installed.
