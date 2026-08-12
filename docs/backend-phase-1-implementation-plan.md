# Phase 1 Backend Implementation Plan

## Goal
Build the first production-style Spring Boot backend slice for the student identification system:

- Spring Boot project setup
- MySQL configuration
- Student module CRUD APIs
- DTO-based layered architecture
- Validation and global exception handling
- Test coverage for the student workflow

This phase deliberately stops before image upload, AI integration, audit logging, and security.

## Current Baseline
The backend currently contains only the Spring Boot entry class, a minimal test, and a placeholder `application.properties`. The `pom.xml` still needs to be aligned with the target stack because it currently uses the wrong database driver and test dependencies for the intended Spring Boot 3 + MySQL setup.

## Target Package Structure

```text
com.uop.backend
├── BackendApplication.java
├── config
├── controller
├── dto
│   ├── request
│   └── response
├── exception
├── model
├── repository
├── service
│   └── impl
└── mapper
```

## Phase 1 Data Model

Student table fields:

- `id` - primary key
- `student_id` - unique student identifier used by the university
- `full_name`
- `faculty`
- `email` - unique email address
- `image_path` - nullable for Phase 1, reserved for later image upload
- `created_at`
- `updated_at`

## API Surface

### Student CRUD

- `POST /api/students`
- `GET /api/students`
- `GET /api/students/{id}`
- `PUT /api/students/{id}`
- `DELETE /api/students/{id}`

## Implementation Order

### Step 1: Align project dependencies
Update the Maven configuration to the target backend stack:

- Spring Boot 3.x compatible setup
- `spring-boot-starter-web`
- `spring-boot-starter-data-jpa`
- `spring-boot-starter-validation`
- `mysql-connector-j`
- `lombok`
- `spring-boot-starter-test`

Remove the PostgreSQL runtime dependency and the incorrect starter names if they are present.

### Step 2: Configure application properties
Create a clean local-development configuration in `application.properties`:

- MySQL datasource URL
- username and password placeholders
- JPA dialect and DDL strategy
- SQL formatting and logging options
- upload-related placeholders for later phases if needed

### Step 3: Create the Student entity
Model the student as a JPA entity with:

- unique constraints for `studentId` and `email`
- automatic timestamps
- nullable `imagePath` for future use

### Step 4: Add DTOs
Create request and response DTOs so controllers never expose entities directly.

Suggested DTOs:

- `StudentCreateRequest`
- `StudentUpdateRequest`
- `StudentResponse`

### Step 5: Add repository layer
Create `StudentRepository` with query methods for:

- checking duplicate `studentId`
- checking duplicate `email`
- standard CRUD operations

### Step 6: Add service layer
Create `StudentService` and `StudentServiceImpl` to own business rules:

- create student
- list students
- get student by id
- update student
- delete student

Business rules to enforce:

- `studentId` must be unique
- `email` must be unique
- `fullName`, `faculty`, `email`, and `studentId` must be validated
- return clean not-found errors when a student does not exist

### Step 7: Add mapper functions
Map between entity and DTOs in a dedicated mapper class or static mapper methods.

### Step 8: Add controller layer
Create `StudentController` under `/api/students` with RESTful endpoints and proper HTTP status codes:

- `201 Created` for create
- `200 OK` for reads and updates
- `204 No Content` for delete

### Step 9: Add exception handling
Create a global exception handler for:

- validation failures
- entity not found
- duplicate record conflicts
- generic fallback errors

Recommended response shape:

```json
{
  "timestamp": "2026-06-10T12:00:00",
  "status": 400,
  "error": "Validation Failed",
  "message": "Email is invalid",
  "path": "/api/students"
}
```

### Step 10: Add validation
Apply Jakarta Validation annotations to request DTOs:

- `@NotBlank` for required text fields
- `@Email` for email
- `@Size` for field length limits
- custom validation only if a rule cannot be expressed with standard annotations

### Step 11: Add tests
Add tests in this order:

- repository tests for uniqueness queries
- service tests for business rules
- controller tests for request/response behavior
- application context smoke test

## Recommended Initial End-State
After Phase 1, the backend should support complete Student CRUD with validation, clean error responses, and a MySQL-backed persistence layer ready for Phase 2 image upload.

## Suggested Build Checklist

1. Fix Maven dependencies.
2. Configure MySQL and JPA.
3. Add the Student entity and repository.
4. Add request/response DTOs.
5. Implement service logic and mapper methods.
6. Expose the REST controller.
7. Add global error handling.
8. Write tests and verify the build.

## Next Phase Boundary
Do not start image upload, AI service integration, audit logs, or security until the Student CRUD workflow is complete and verified.