# Rallly Helm Chart

## Overview

The Rallly Helm chart provides a simple way to deploy the Rallly application along with a PostgreSQL database on Kubernetes. This chart allows you to customize various aspects of the deployment, including database persistence, PostgreSQL version, and connection settings.

## Features

- Deploys the Rallly application with a PostgreSQL database.
- Options to enable or disable persistent storage for the database.
- Ability to define the size of the persistent volume for the database (default: 1GB).
- Override the PostgreSQL version (default: 15).
- Specify a custom PostgreSQL password.
- Override the DATABASE_URL for external PostgreSQL services.

## Prerequisites

- Kubernetes 1.12+
- Helm 3.0+

## Installation

To install the chart with the release name `rallly` in namespace `rallly`, run the following command:

```bash
helm install --create-namespace --namespace rallly rallly ./rallly
```

## Configuration

The following table lists the configurable parameters of the Rallly chart and their default values:

| Parameter                     | Description                                           | Default                                   |
|-------------------------------|-------------------------------------------------------|-------------------------------------------|
| `database.url`                | PostgreSQL connection string or external database URL | `postgres://postgres:postgres@rallly-postgresql/rallly` |
| `host`                        | Host name for the application                         | `rallly.demo`                             |
| `apiSecret`                   | Secret for API security                               | `abcdef1234567890abcdef1234567890`        |
| `updateStrategy`              | Deployment update strategy                            | `RollingUpdate`                           |
| `secretPassword`              | Application secret password                           | `abcdef1234567890abcdef1234567890`        |
| `supportEmail`                | Support email address                                 | `support@example.org`                     |
| `noReplyEmail`                | No-reply email address                                | `no-reply@example.org`                    |
| `baseUrl`                     | Base URL for the application                          | `https://rallly.demo:57176`               |
| `postgresql.enabled`          | Enable built-in PostgreSQL database                   | `true`                                    |
| `postgresql.auth.postgresPassword` | PostgreSQL password                              | `postgres`                                |
| `postgresql.auth.enablePostgresUser` | Enable postgres user                           | `true`                                    |
| `postgresql.auth.database`    | PostgreSQL database name                              | `rallly`                                  |
| `tls.enabled`                 | Enable TLS                                            | `true`                                    |
| `ingress.enabled`             | Enable ingress                                        | `true`                                    |
| `ingress.clusterIssuer`       | Cert-manager cluster issuer                           | `ca-issuer`                               |
| `ingress.className`           | Ingress class name                                    | `nginx`                                   |
| `ingress.annotations`         | Additional ingress annotations                        | `{}`                                      |
| `image.tag`                   | Application image tag                                 | `sctg/rallly:latest`                      |
| `image.pullPolicy`            | Image pull policy                                     | `IfNotPresent`                            |

## External PostgreSQL Database

To use an external PostgreSQL database (like Neon), disable the built-in PostgreSQL and provide your connection string:

```yaml
postgresql:
  enabled: false

database:
  url: "postgres://username:password@hostname:port/database"
```

## Uninstallation

To uninstall the `rallly` release, run the following command:

```bash
helm uninstall -n rallly rallly
```

## Notes

- If you have enabled persistence, the data will be retained even after the release is deleted.
- Make sure to configure secure passwords and secrets in production environments.
- The chart includes an SMTP relay via the flex-smtpd dependency for email functionality.
