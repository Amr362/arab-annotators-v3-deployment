# Arab Annotators Platform — TODO

## Phase 1: Core Infrastructure ✅
- [x] Database schema (users, projects, tasks, annotations, qa_reviews, statistics, notifications, llm_suggestions)
- [x] User authentication and role-based access control
- [x] User model with roles (admin, tasker, qa)
- [x] Project model with metadata
- [x] Task model for annotation items
- [x] Annotation model for storing results
- [x] QA Review model for quality checks

## Phase 2: Admin Dashboard ✅
- [x] Admin dashboard layout and navigation (tabs: overview / users / projects / export)
- [x] User management page (create, edit, delete, activate/deactivate)
- [x] Bulk user creation with auto-generated passwords + CSV download
- [x] Project management (view, progress tracking)
- [x] Statistics overview
- [x] Export annotations (JSON + CSV per project)

## Phase 3: Branding & Logo ✅
- [x] Custom fonts (Arabic)
- [x] Animated cartoon logo (water jar)
- [x] Color palette (Saudi theme)
- [x] UI components styling

## Phase 4: Tasker Interface ✅
- [x] Tasker dashboard with assigned tasks
- [x] Task statistics and progress tracking
- [x] Personal statistics display (completedToday, accuracy from QA reviews)
- [x] Task submission workflow (submitAnnotation mutation)
- [x] Open in Label Studio button

## Phase 5: QA Interface ✅
- [x] QA dashboard with review queue
- [x] Approval/rejection workflow (approve + reject mutations with feedback dialog)
- [x] Real-time stats (pendingReviews, approvedCount, rejectedCount, agreementRate)

## Phase 6: IAA & Agreement Metrics ✅
- [x] Inter-Annotator Agreement (IAA) endpoints
- [x] Cohen's Kappa coefficient (pairwise, 2 annotators)
- [x] Fleiss' Kappa (multiple annotators)
- [ ] IAA visualization page (UI not yet built, endpoints ready at trpc.iaa.*)

## Phase 7: Advanced Features ✅
- [x] Notification system (progress milestones: 25%, 50%, 75%, 100%)
- [x] Notification bell in header with unread badge + dropdown
- [x] Mark read / mark all read
- [x] Export functionality (JSON, CSV, Excel-compatible)
- [ ] LLM integration for annotation suggestions (schema ready: llm_suggestions table)
- [ ] Feedback system for taskers (QA feedback stored, UI display not yet wired)

## Phase 8: Label Studio Integration
- [ ] Label Studio API integration
- [ ] Webhook handlers for Label Studio events
- [ ] Task synchronization
- [ ] Annotation import/export (backend export ready, LS sync pending)

## Phase 9: Deployment ✅
- [x] Dockerfile for custom app
- [x] docker-compose.yml with Label Studio
- [x] Environment configuration for Railway
- [x] Database migration scripts
- [x] Initialization script for creating demo data (scripts/init-data.mjs)
- [x] Railway-specific files (railway.json, .railwayignore, Procfile)

## Security Fixes Applied ✅
- [x] Server-generated openId (never from client)
- [x] updateUser: correct undefined checks (empty strings accepted)
- [x] projects.create: returns correct project ID via .returning()
- [x] Removed Manus debug artifacts (__manus__/debug-collector.js)
- [x] Admin+QA role check on all QA/tasker procedures

## User Accounts to Create
- [ ] 1 Admin account
- [ ] 20 Tasker accounts (use Admin → Bulk Create → Tasker × 20)
- [ ] 10 QA accounts (use Admin → Bulk Create → QA × 10)

## Project Configuration
- [ ] Project name: "تصنيف الجمل السعودية" (Saudi Sentence Classification)
- [ ] Total items: 40,000 sentences
- [ ] Classification task: Detect "Sunnah" (سنية) in sentences
- [ ] Languages: Arabic (Saudi dialect)
