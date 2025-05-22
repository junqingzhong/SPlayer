# SPlayer Docker Deployment Guide

This document provides instructions for deploying SPlayer using Docker and Docker Compose. This setup runs the SPlayer frontend via Nginx, the SPlayer backend API server, the Binaryify NeteaseCloudMusicApi server, and the UnblockNeteaseMusic service.

## Architecture Overview

The Docker deployment consists of a single service defined in `docker-compose.yml`, which internally runs multiple processes:

1.  **Nginx**: Serves the SPlayer static frontend (built Vue.js application) and acts as a reverse proxy.
2.  **SPlayer Backend API**: A Node.js Fastify server (derived from SPlayer's Electron main process code) providing SPlayer-specific API functionalities. This is accessible via Nginx at `/splayer-api/`.
3.  **Binaryify NeteaseCloudMusicApi Server**: The standard Node.js server for the `NeteaseCloudMusicApi` package, providing access to Netease Cloud Music services. This is accessible via Nginx at `/api/netease/`.
4.  **UnblockNeteaseMusic Service**: A service that attempts to unlock region-restricted Netease songs by finding alternative sources. It works in conjunction with the Binaryify Netease API server.

## Prerequisites

-   **Docker**: Ensure Docker is installed and running on your system. [Install Docker](https://docs.docker.com/get-docker/)
-   **Docker Compose**: Ensure Docker Compose is installed (usually included with Docker Desktop). [Install Docker Compose](https://docs.docker.com/compose/install/)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/imsyy/SPlayer.git
cd SPlayer
```

### 2. Prepare Configuration Files

-   **Nginx Configuration (`nginx.conf`):**
    The repository includes a pre-configured `nginx.conf` file. This file will be mounted into the Docker container. It's set up to serve the SPlayer frontend and proxy API requests to the SPlayer backend and the Netease API server.

-   **SPlayer User Data Directory:**
    Create a directory to persist SPlayer user settings (e.g., `electron-store` data).
    ```bash
    mkdir splayer_data
    ```
    This directory will be mounted as a volume into the container.

-   **(Optional) Customize Host Port:**
    By default, Nginx (and thus the SPlayer UI) will be accessible on host port `8080`. If you wish to use a different port, you can modify the `ports` section in `docker-compose.yml` before building and running. For example, to use port `80`:
    ```yaml
    # In docker-compose.yml
    ports:
      - "80:80" # Exposes Nginx on host port 80
    ```

### 3. Build and Run with Docker Compose

From the root directory of the cloned repository, run:

```bash
docker-compose up -d --build
```

-   `--build`: Forces Docker Compose to build the SPlayer image using the provided `Dockerfile`.
-   `-d`: Runs the containers in detached mode (in the background).

## Accessing SPlayer

Once the containers are up and running:

-   **SPlayer UI**: Open your web browser and navigate to `http://localhost:HOST_NGINX_PORT`.
    -   If you used the default `docker-compose.yml`, this will be `http://localhost:8080`.
    -   If you changed the host port in `docker-compose.yml`, use that port instead.

## Persisted Data

-   **SPlayer User Settings**: User-specific settings (like those managed by `electron-store` in the desktop app) are stored in the `./splayer_data` directory on your host machine. This directory is mounted to `/app/splayer_config` inside the container, and the `ELECTRON_STORE_PATH` environment variable is set to `/app/splayer_config/config.json`.
-   **Nginx Configuration**: The Nginx configuration is mounted from `./nginx.conf` on your host machine. If you need to customize Nginx behavior, you can modify this file and restart the Docker Compose service (`docker-compose restart SPlayer`).

## Environment Variables

The following environment variables are configured in `docker-compose.yml` for the `SPlayer` service:

-   `VITE_SPLAYER_BACKEND_PORT=25885`: Specifies the port on which the SPlayer backend API server listens *inside the container*. Nginx proxies requests to this port.
-   `SPLAYER_DOCKER_MODE=true`: A custom environment variable that signals to the SPlayer application code (`electron/main/index.ts`) to run in "backend-only" mode, disabling Electron window creation and starting only the Fastify server.
-   `NETEASE_SERVER_IP`: (Optional) IP address for the Netease Cloud Music API server.
-   `UNBLOCK_SOURCES`: (Optional) Sources for the UnblockNeteaseMusic service (e.g., `kugou kuwo bilibili`).
-   Other UnblockNeteaseMusic specific environment variables (e.g., `ENABLE_FLAC`, `LOG_LEVEL`).

## Important Limitation: Settings Management

**Crucial Note:** This Docker deployment primarily focuses on serving the SPlayer UI and making its backend music functionalities (Netease API, UnblockMusic, SPlayer's own API logic) available.

However, features that rely heavily on Electron's Inter-Process Communication (IPC) mechanisms for direct interaction between the UI and the main process **will not work as they do in the desktop application**. This particularly affects **settings management**.

-   The existing Settings UI in SPlayer (Vue components) uses `window.electron.ipcRenderer.send(...)` and `window.electron.ipcRenderer.invoke(...)` to communicate changes to the Electron main process, which then saves them using `electron-store`.
-   In this Docker setup, the UI is served by Nginx and runs in a standard web browser, where `window.electron` is not available.
-   **Therefore, saving settings through the existing UI will not function.**

To enable full settings interactivity in this Dockerized environment, the SPlayer application would require significant refactoring:
1.  The SPlayer backend (Fastify server) would need to expose new HTTP API endpoints (e.g., under `/splayer-api/settings`) for getting and setting application configurations.
2.  The frontend Settings UI components would need to be modified to make HTTP requests to these new backend endpoints instead of using Electron IPC.

This version of the Docker deployment provides the core music playback experience but does not replicate the full settings interactivity of the Electron desktop application due to these architectural differences. User settings will rely on the defaults or the `config.json` file manually placed or modified within the `./splayer_data` volume.

## Troubleshooting

-   **View Logs**: To see the combined logs for all services (Nginx, SPlayer backend, UnblockNeteaseMusic):
    ```bash
    docker-compose logs -f SPlayer
    ```
-   **Common Issues**:
    -   **Port Conflicts**: If the host port (e.g., `8080`) is already in use, `docker-compose up` will fail. Change the host port mapping in `docker-compose.yml`.
    -   **Nginx Configuration Errors**: If Nginx fails to start, check for syntax errors in `./nginx.conf`.
    -   **Backend Not Starting**: Check the logs for errors from the SPlayer backend or UnblockNeteaseMusic service. Ensure environment variables are correctly set.
    -   **API Issues**: Test API endpoints using `curl` or a tool like Postman:
        -   Netease API (via Unblock): `curl http://localhost:HOST_NGINX_PORT/api/netease/search?keywords=someartist`
        -   SPlayer API: `curl http://localhost:HOST_NGINX_PORT/splayer-api/unblock/netease?id=someid`

This setup aims to provide a convenient way to run SPlayer and its associated services in a containerized environment.
