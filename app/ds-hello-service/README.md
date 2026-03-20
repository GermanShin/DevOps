# ds-hello-service

Minimal Spring Boot prototype to verify the full AWS pipeline:
GitHub → CodeBuild → ECR → ECS → RDS

## Endpoints

| Method | Path             | Auth   | Purpose                    |
|--------|------------------|--------|----------------------------|
| GET    | /actuator/health | Public | ALB health check           |
| GET    | /hello           | Public | Basic sanity check         |
| GET    | /db              | Public | Proves ECS → RDS connection|

## Run Locally

### Start PostgreSQL
```bash
docker run -d --name ds-postgres \
  -e POSTGRES_DB=dsapp \
  -e POSTGRES_USER=dsadmin \
  -e POSTGRES_PASSWORD=localpassword \
  -p 5432:5432 postgres:16-alpine
```

### Run
```bash
./gradlew bootRun
```

### Test
```bash
curl http://localhost:8080/actuator/health
curl http://localhost:8080/hello
curl http://localhost:8080/db
```

## Docker Build
```bash
docker build -t ds-hello-service:local .

docker run -p 8080:8080 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=dsapp \
  -e DB_USERNAME=dsadmin \
  -e DB_PASSWORD=localpassword \
  ds-hello-service:local
```

## Environment Variables (ECS)

| Variable   | Description              | Default        |
|------------|--------------------------|----------------|
| DB_HOST    | RDS endpoint             | localhost      |
| DB_PORT    | PostgreSQL port          | 5432           |
| DB_NAME    | Database name            | dsapp          |
| DB_USERNAME| DB username              | dsadmin        |
| DB_PASSWORD| DB password              | localpassword  |
