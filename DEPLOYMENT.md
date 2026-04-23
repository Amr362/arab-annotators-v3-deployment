# Arab Annotators Platform - Deployment Guide

## Overview

Arab Annotators هي منصة احترافية لتصنيف وتعليق البيانات العربية، مبنية على Label Studio مع واجهة تحكم متقدمة وإدارة مستخدمين شاملة.

## Architecture

المنصة تتكون من:
- **Frontend**: React 19 + Tailwind CSS 4
- **Backend**: Express + tRPC
- **Database**: PostgreSQL 15+
- **Label Studio**: Label Studio (Docker)
- **Reverse Proxy**: Nginx
- **Authentication**: Manus OAuth

## Prerequisites

- Docker و Docker Compose
- Node.js 22+ (للتطوير المحلي)
- PostgreSQL 15+ (إذا لم تستخدم Docker)
- PostgreSQL 15+ (لـ Label Studio)

## Local Development

### 1. Setup Environment

```bash
cd /home/ubuntu/arab-annotators-platform
cp .env.example .env
# Edit .env with your configuration
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Initialize Database

```bash
pnpm db:push
```

### 4. Create Initial Data

```bash
node scripts/init-data.mjs
```

This will create:
- 1 Admin user
- 20 Tasker users
- 10 QA Reviewer users

Credentials will be saved to `credentials.json`

### 5. Start Development Server

```bash
pnpm dev
```

Access the application at: http://localhost:3000

## Docker Deployment

### 1. Build and Run with Docker Compose

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database
- PostgreSQL (for Label Studio)
- Label Studio (http://localhost:8080)
- Arab Annotators App (http://localhost:3000)
- Nginx reverse proxy (http://localhost)

### 2. Initialize Data in Docker

```bash
docker-compose exec app node scripts/init-data.mjs
```

### 3. Access Services

- **Arab Annotators**: http://localhost:3000
- **Label Studio**: http://localhost:8080
- **Nginx**: http://localhost

## Railway Deployment

### 1. Prepare for Railway

```bash
# Create railway.json
cat > railway.json << 'EOF'
{
  "build": {
    "builder": "dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/index.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 30
  }
}
EOF
```

### 2. Set Environment Variables in Railway

In Railway dashboard, set these variables:

```
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=your-secret-key
VITE_APP_ID=your-app-id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im/login
OWNER_OPEN_ID=your-owner-id
OWNER_NAME=Your Name
BUILT_IN_FORGE_API_KEY=your-api-key
BUILT_IN_FORGE_API_URL=https://api.manus.im/forge
VITE_FRONTEND_FORGE_API_KEY=your-frontend-key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im/forge
VITE_ANALYTICS_ENDPOINT=https://analytics.manus.im
VITE_ANALYTICS_WEBSITE_ID=your-website-id
VITE_APP_TITLE=Arab Annotators
VITE_APP_LOGO=https://your-cdn.com/logo.png
```

### 3. Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Deploy
railway up
```

## User Roles and Access

### Admin
- Full access to all features
- User management
- Project management
- Statistics and reporting
- Access: `/admin`

### Tasker
- Can view and complete annotation tasks
- View personal statistics
- Access: `/tasker/tasks`

### QA Reviewer
- Can review submitted annotations
- Approve or reject annotations
- View review statistics
- Access: `/qa/queue`

## Database Schema

### Tables

1. **users**: User accounts with roles
2. **projects**: Annotation projects
3. **tasks**: Individual items to annotate
4. **annotations**: Submitted annotations
5. **qa_reviews**: Quality assurance reviews
6. **statistics**: Performance metrics
7. **notifications**: System notifications
8. **llm_suggestions**: AI-powered suggestions

## API Endpoints

### Admin APIs
- `GET /api/trpc/admin.getAllUsers` - Get all users
- `GET /api/trpc/admin.getUser` - Get specific user
- `POST /api/trpc/admin.createUser` - Create new user
- `POST /api/trpc/admin.updateUser` - Update user
- `POST /api/trpc/admin.deleteUser` - Delete user

### Project APIs
- `GET /api/trpc/projects.getAll` - Get all projects
- `GET /api/trpc/projects.getById` - Get specific project
- `POST /api/trpc/projects.create` - Create project

### Task APIs
- `GET /api/trpc/tasks.getByProject` - Get project tasks
- `GET /api/trpc/tasks.getById` - Get specific task

### Statistics APIs
- `GET /api/trpc/statistics.getProjectStats` - Get project statistics

## Label Studio Integration

Label Studio runs in a separate container and handles the actual annotation interface.

### Configuration

Label Studio is configured with:
- PostgreSQL database backend
- Disabled signup without link
- Custom project templates

### Access

- URL: http://localhost:8080 (or http://label-studio:8080 in Docker)
- Default credentials: admin/password (set during first run)

## Monitoring and Logging

### Docker Logs

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app
docker-compose logs -f label-studio
docker-compose logs -f mysql
```

### Health Checks

The application includes health checks:
- Endpoint: `/api/health`
- Interval: 30 seconds
- Timeout: 10 seconds

## Backup and Recovery

### Database Backup

```bash
# Backup PostgreSQL
docker-compose exec db pg_dump -U annotator arab_annotators > backup.sql

# Restore PostgreSQL
docker-compose exec -T db psql -U annotator arab_annotators < backup.sql
```

### Label Studio Data

Label Studio data is stored in Docker volume `label_studio_data`. To backup:

```bash
docker-compose exec label-studio tar czf /tmp/label-studio-backup.tar.gz /label-studio/data
docker cp arab-annotators-label-studio:/tmp/label-studio-backup.tar.gz .
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps db

# Check logs
docker-compose logs db

# Verify connection
docker-compose exec db psql -U annotator -c "SELECT 1"
```}],path:

### Label Studio Not Starting

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check Label Studio logs
docker-compose logs label-studio

# Restart Label Studio
docker-compose restart label-studio
```

### Application Not Starting

```bash
# Check logs
docker-compose logs app

# Verify environment variables
docker-compose exec app env | grep DATABASE_URL

# Check database migrations
docker-compose exec app pnpm db:push
```

## Performance Optimization

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_tasks_project_id ON tasks(projectId);
CREATE INDEX idx_annotations_task_id ON annotations(taskId);
CREATE INDEX idx_annotations_user_id ON annotations(userId);
CREATE INDEX idx_qa_reviews_annotation_id ON qa_reviews(annotationId);
```

### Nginx Caching

Nginx is configured with gzip compression and proper caching headers.

### Application Scaling

For production deployments with high load:
1. Use multiple application instances behind load balancer
2. Configure connection pooling in database
3. Enable Redis for session management
4. Use CDN for static assets

## Security Considerations

1. **SSL/TLS**: Use proper SSL certificates in production (not self-signed)
2. **Secrets**: Never commit `.env` files with real credentials
3. **Database**: Use strong passwords and restrict network access
4. **API Keys**: Rotate API keys regularly
5. **CORS**: Configure CORS properly for your domain
6. **Rate Limiting**: Implement rate limiting for API endpoints

## Support and Documentation

- **Label Studio Docs**: https://labelstud.io/guide/
- **Manus Documentation**: https://help.manus.im
- **Project Repository**: https://github.com/your-repo/arab-annotators

## License

Arab Annotators Platform - All Rights Reserved

---

For more information and support, contact: support@arab-annotators.local
