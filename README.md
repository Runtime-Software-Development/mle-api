# Mountain Legacy Explorer API

## Overview
------------

The Mountain Legacy Explorer (MLE) API is a metadata management tool designed to browse and edit the Mountain Legacy project (MLP) collection. This API provides a platform for viewing both historic and corresponding modern survey images.

### Mountain Legacy Project (MLP)

 The [Mountain Legacy Project](http://mountainlegacy.ca/) at the University of Victoria supports numerous research initiatives exploring the use of repeat photography to study ecosystem, landscape, and anthropogenic changes. MLP hosts the largest systematic collection of mountain photographs, with over 120,000 high-resolution historic (grayscale) survey photographs of Canada’s Western mountains captured from the 1880s through the 1950s, with over 9,000 corresponding modern (colour) repeat images. 


## API Components
------------------

The MLE API consists of the following components:

*   **MLE Explorer Client** (ReactJS): The front-end interface for interacting with the MLP collection.
*   **MLE API** (NodeJS): The backend API for managing data and business logic.
*   **MLE Image Queue** (NodeJS): A service for processing image-related tasks asynchronously.

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

The MLE API uses authentication to ensure secure access to the API endpoints. The API supports the following authentication methods:

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


## Repository
--------------

The MLE API repository is located at [https://github.com/scrose/mle-api](https://github.com/scrose/mle-api).