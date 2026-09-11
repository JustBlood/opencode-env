---
name: spring-boot-java
description: Use when changing Java 21 Spring Boot controllers, services, repositories, configuration, or Maven tests in the Courses backend.
compatibility: OpenCode project-local
---

# Spring Boot Java

Use the existing Maven module `monolith-mvp`. Preserve current controller/service/model boundaries, validation, error handling, security configuration, and integration-test style. Prefer a focused `mvn -pl monolith-mvp -Dtest=... test`; use `mvn -pl monolith-mvp -am test` for broader verification. Do not inspect secret values or run stage/prod profiles.

Official references: https://docs.spring.io/spring-boot/docs/3.2.3/reference/html/ and https://maven.apache.org/guides/
