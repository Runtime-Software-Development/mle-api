# Mountain Legacy Explorer API

## Overview

The Mountain Legacy Explorer (MLE) API is a metadata management tool designed to browse and edit the Mountain Legacy project (MLP) collection. This API provides a platform for viewing both historic and corresponding modern survey images.

### Mountain Legacy Project (MLP)

 The [Mountain Legacy Project](http://mountainlegacy.ca/) at the University of Victoria supports numerous research initiatives exploring the use of repeat photography to study ecosystem, landscape, and anthropogenic changes. MLP hosts the largest systematic collection of mountain photographs, with over 120,000 high-resolution historic (grayscale) survey photographs of Canada’s Western mountains captured from the 1880s through the 1950s, with over 9,000 corresponding modern (colour) repeat images. 


## Local Development Setup

This repository contains the necessary configurations to run the Mountain Legacy Explorer (MLE) backend API, Keycloak authentication server, and PostgreSQL database locally using Docker Compose. This setup is ideal for development and testing purposes.


### docker-compose

This `docker-compose.yml` orchestrates three core services for the MLE application:

1.  **`mlp-api`**: The backend Node.js API that serves data to the frontend application.
2.  **`keycloak`**: An open-source identity and access management solution used for user authentication and authorization.
3.  **`postgres`**: A PostgreSQL database instance to store application data.

The setup is designed for local development, including automatic database initialization from a backup file and a pre-configured Keycloak realm.

### Prerequisites

Before you begin, ensure you have the following installed on your system:

  * **Docker Desktop**: Includes Docker Engine and Docker Compose.
      * [Download Docker Desktop](https://www.docker.com/products/docker-desktop)

### Getting Started

Follow these steps to get your local MLE development environment up and running.

#### Prepare the Database Initialization

The `postgres` service is configured to initialize its database from a SQL backup file.

  * **Create the directory:**

    ```bash
    mkdir -p db_init
    ```

  * **Place database backup file:** Copy a MLE PostgreSQL database backup file (e.g., `.sql` init file) into the newly created `db_init` directory.

    ```bash
    cp /path/to/your/mlp_backup.sql db_init/
    ```

    The `docker-compose.yml` expects any `.sql` or executable `.sh` files in this directory to be run when the `postgres` container starts for the *first time*.

      * **Important Note on Database Initialization:** The database initialization scripts (from `db_init`) only run when the `postgres_data` volume is empty. If you've run the services before and want to re-initialize the database from scratch, you must remove the persistent volume:
        ```bash
        docker compose down -v
        ```
        Then, run `docker compose up --build` again.

#### Create the Environment File

The `mlpapi` service uses an `.env` file for environment variables, including database connection details.

  * **Create a `.env` file** in the same directory as your `docker-compose.yml`:

    ```bash
    touch .env
    ```

  * **Add the following content** to your `.env` file, replacing placeholder values as necessary (especially for production use):


| Environment Variable | Default Value | Description |
| :------------------- | :------------ | :---------- |
| `NODE_ENV`           | `local`       | Sets the Node.js environment. Use `local` for local development. |
| `DEBUG`              | `true`        | Enables or disables debug logging for the application. |
| `MLE_API_PORT`       | `3001`        | The port on which the MLE API server will listen. |
| `MLE_API_BASEURL`    | `http://localhost:3001` | The base URL for the MLE API. |
| `MLE_API_EMAIL`      | `user@example.ca` | Default email for API access/admin user (for development). |
| `MLE_API_PASS`       | `1234567890`  | Default password for API access/admin user (for development). |
| `MLE_API_HASH`       | `1234567890`  | Hash value used for API security (placeholder). **Change for production.** |
| `MLE_API_SALT`       | `1234567890`  | Salt value used for API security (placeholder). **Change for production.** |
| `MLE_LOG_FORMAT`     | `dev`         | Specifies the logging format for the API (e.g., `dev` for development, `combined` for production). |
| `MLE_APP_BASEURL`    | `http://localhost:3000` | The base URL of the frontend application. |
| `MLE_KC_REALM`       | `mlp-realm`   | The Keycloak realm used for authentication. |
| `MLE_KC_SERVER_URL`  | `http://localhost:8081/auth` | The base URL for the Keycloak authentication server. |
| `MLE_KC_CLIENT_ID`   | `mle-kc-client` | The client ID for the MLE application registered in Keycloak. |
| `MLE_KC_CLIENT_SECRET` | `5b01ce26-d23b-4c2d-9371-a7be962f23f6` | The client secret for the MLE application in Keycloak. **Highly sensitive, change for production.** |
| `MLE_COOKIE_SECRET`  | `1234567890`  | Secret used for signing session cookies. **Change for production.** |
| `MLE_QUEUE_NAME`     | `mle-queue`   | The name of the job queue used by the application. |
| `MLE_QUEUE_CONCURRENCY` | `5`        | The number of concurrent jobs the queue worker can process. |
| `MLE_QUEUE_SERVER_URL` | `http://localhost:3002` | The URL where the queue server is accessible. |
| `MLE_QUEUE_PORT`     | `3002`        | The port on which the queue server listens. |
| `MLE_REDIS_HOST`     | `127.0.0.1`   | The hostname or IP address of the Redis server. |
| `MLE_REDIS_PORT`     | `6379`        | The port of the Redis server. |
| `POSTGRES_INITDB_ARGS` | `--auth-host=scram-sha-256` | Arguments passed to `initdb` when initializing the PostgreSQL database. |
| `MLE_UPLOAD_DIR`     | `/MLE/mle-data/uploads` | Local path for uploaded original files. |
| `MLE_TMP_DIR`        | `/MLE/mle-data/tmp` | Local path for temporary files during processing. |
| `MLE_LOWRES_DIR`     | `/MLE/mle-data/versions` | Local path for processed low-resolution image versions. |
| `MLE_ROOT_DIR`       | `/MLE/mle-data/mle-queue` | Root directory for application-related data, specifically for the queue. |


#### Build and Run the Services

Navigate to the directory containing your `docker-compose.yml` and run:

```bash
docker compose up --build
```

  * `docker compose up`: Starts all services defined in the `docker-compose.yml`.
  * `--build`: Forces Docker to rebuild images for services that have a `build` context (like `mlpapi`). This is crucial if you've made changes to your `mlpapi` `Dockerfile` or source code.

Once the services are up:

  * The `mlpapi` should be accessible at `http://localhost:3001`.
  * Keycloak should be accessible at `http://localhost:8081`. You can log in to the admin console with `admin`/`admin`.

## Service Details

### `mlp-api` (Node.js API)

  * **Image**: `mlp-api` (built from your local `Dockerfile`)
  * **Ports**:
      * `3001:3001` (API application port)
      * `9229:9229` (Node.js debugger port)
  * **Dependencies**: Requires the `postgres` service to be healthy before starting.
  * **Configuration**: Reads database and other settings from the `.env` file.

### `keycloak` (Authentication Server)

  * **Image**: `quay.io/keycloak/keycloak:24.0.2`
  * **Command**: `start-dev --http-port=8081 --import-realm` (Starts in development mode and imports the `mle-local-realm.json` realm on startup).
  * **Ports**: `8081:8081` (Keycloak application port)
  * **Admin Credentials**: `admin` / `admin`
  * **Realm Initialization**: Automatically imports the `mle-local-realm.json` file located in the same directory as `docker-compose.yml` into Keycloak. This provides a pre-configured realm for testing.

### `postgres` (Database)

  * **Image**: `postgres:16-alpine` (lightweight PostgreSQL image)
  * **Ports**: `5432:5432` (PostgreSQL standard port)
  * **Database Name**: `mle_db`
  * **User**: `mlp_user`
  * **Password**: `mlp_password`
  * **Data Persistence**: Uses a named volume `postgres_data` to ensure your database data persists even if the container is removed.
  * **Initialization**: Executes `.sql` files placed in the `db_init` directory during the first startup to populate the database from your backup.
  * **Health Check**: Ensures the database is ready to accept connections before dependent services start.

## Troubleshooting

  * **`mlp-api` fails to connect to database**:
      * Ensure the `postgres` container is running and healthy (`docker compose ps`).
      * Verify your `.env` file has the correct `DATABASE_*` variables matching the `postgres` service's `environment` section.
      * Check `mlpapi` logs for specific connection errors: `docker compose logs mlpapi`.
  * **Database not initialized**:
      * Confirm your `backup.sql` file is in the `db_init` directory.
      * Remember that initialization only happens on the *first* run (when `postgres_data` volume is empty). If you've run it before, try `docker compose down -v` then `docker compose up --build`.
  * **Keycloak Admin Console unreachable**:
      * Check Keycloak logs: `docker compose logs keycloak`.
      * Ensure port `8081` is not already in use on your host machine.
  * **General container issues**:
      * Check container logs for any service: `docker compose logs <service_name>`.
      * Stop and restart all services: `docker compose down && docker compose up --build`.


## API Endpoints
----------------

The MLE API provides the following endpoints:

*   **GET /files**: Retrieve a list of files in the MLP collection.
*   **GET /files/{id}**: Retrieve a specific file by ID.
*   **POST /files**: Create a new file in the MLP collection.
*   **PUT /files/{id}**: Update a specific file by ID.
*   **DELETE /files/{id}**: Delete a specific file by ID.

*   **GET /fields**: Retrieve a list of fields in the MLP collection.
*   **GET /fields/{id}**: Retrieve a specific field by ID.
*   **POST /fields**: Create a new field in the MLP collection.
*   **PUT /fields/{id}**: Update a specific field by ID.
*   **DELETE /fields/{id}**: Delete a specific field by ID.

## API Models
--------------

The MLE API uses the following models:

*   **File**: Represents a file in the MLP collection.
*   **Field**: Represents a field in the MLP collection.

## API Authentication
----------------------

The MLE API uses OIDC authentication to ensure secure access to the API endpoints. The API supports the following authentication methods:

*   **Basic Auth**: Use a username and password to authenticate.
*   **Token Auth**: Use a token to authenticate.

## API Error Handling
----------------------

The MLE API uses error handling to ensure that errors are properly handled and returned to the client. The API returns error responses in the following format:

*   **Error Code**: A unique error code.
*   **Error Message**: A human-readable error message.

## API Documentation
----------------------

This API documentation provides detailed information about the API endpoints, models, and authentication methods. It is recommended that you read this documentation carefully before using the API.

## API License
----------------

The MLE API is licensed under the MIT License.

## API Contributing
--------------------

Contributions to the MLE API are welcome. Please submit a pull request to the repository with your changes.

### API Issues
----------------

If you encounter any issues with the MLE API, please submit an issue to the repository.

## Team
---------

Developed and maintained by Runtime Software Development Inc.
