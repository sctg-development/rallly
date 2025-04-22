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

To install the chart with the release name `my-release`, run the following command:

```bash
helm install my-release ./rallly
```

## Configuration

The following table lists the configurable parameters of the Rallly chart and their default values:

| Parameter                     | Description                                           | Default           |
|-------------------------------|-------------------------------------------------------|-------------------|
| `persistence.enabled`         | Enable persistent storage for the database           | `true`            |
| `persistence.size`            | Size of the persistent volume                         | `1Gi`             |
| `postgres.image.tag`          | PostgreSQL image tag                                  | `15`              |
| `postgres.password`           | PostgreSQL password                                   | `postgres`        |
| `database.url`                | Override DATABASE_URL for external PostgreSQL        | `postgres://postgres:postgres@rallly_db/rallly` |

## Uninstallation

To uninstall the `my-release` release, run the following command:

```bash
helm uninstall my-release
```

## Notes

- If you have enabled persistence, the data will be retained even after the release is deleted.
- Make sure to configure the `DATABASE_URL` if you are using an external PostgreSQL service.

For further information, please refer to the official documentation of Rallly and Helm.