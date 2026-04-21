# Arab Annotators Platform - TODO

## Phase 1: Core Infrastructure ✅
- [x] Database schema (users, projects, tasks, annotations, qa_reviews, statistics)
- [x] User authentication and role-based access control
- [x] User model with roles (admin, tasker, qa)
- [x] Project model with metadata
- [x] Task model for annotation items
- [x] Annotation model for storing results
- [x] QA Review model for quality checks

## Phase 2: Admin Dashboard ✅
- [x] Admin dashboard layout and navigation
- [x] User management page (create, edit, delete, assign roles)
- [x] Bulk user creation with password generation
- [x] Project management (create, edit, delete)
- [x] Task management (import, view, edit)
- [x] QA queue management
- [x] Statistics overview

## Phase 3: Branding & Logo ✅
- [x] Custom fonts (Arabic)
- [x] Animated cartoon logo (water jar)
- [x] Remove "40,000 sentences" text from homepage
- [x] Fix React setState errors

## Phase 4: Tasker Interface ✅
- [x] Tasker dashboard with assigned tasks
- [x] Task statistics and progress tracking
- [x] Personal statistics display
- [x] Task submission workflow
- [x] Label Studio integration setup

## Phase 5: QA Interface ✅
- [x] QA dashboard with review queue
- [x] Review interface for submitted annotations
- [x] Dual annotation comparison display
- [x] Approval/rejection workflow
- [x] Reviewer statistics

## Phase 6: IAA & Agreement Metrics
- [ ] Inter-Annotator Agreement (IAA) calculation
- [ ] Cohen's Kappa coefficient implementation
- [ ] Fleiss' Kappa for multiple annotators
- [ ] Agreement visualization
- [ ] Disagreement analysis
- [ ] Automated conflict resolution suggestions

## Phase 7: Advanced Features
- [ ] Notification system (progress milestones: 25%, 50%, 75%, 100%)
- [ ] Quality issue alerts
- [ ] LLM integration for annotation suggestions
- [ ] Export functionality (JSON, CSV, Excel)
- [ ] Quality statistics dashboard
- [ ] Feedback system for taskers

## Phase 8: Label Studio Integration
- [ ] Label Studio API integration
- [ ] Webhook handlers for Label Studio events
- [ ] Task synchronization
- [ ] Annotation import/export

## Phase 9: Deployment & Testing
- [x] Create Dockerfile for custom app
- [x] Create docker-compose.yml with Label Studio
- [x] Environment configuration for Railway
- [x] Database migration scripts
- [x] Initialization script for creating demo data
- [ ] Unit tests for core functionality
- [ ] Integration tests
- [ ] User acceptance testing
- [ ] API documentation
- [ ] User guides
- [ ] Admin guides

## User Accounts to Create
- [ ] 1 Admin account
- [ ] 20 Tasker accounts (with unique passwords)
- [ ] 10 QA accounts (with unique passwords)

## Project Configuration
- [ ] Project name: "تصنيف الجمل السعودية" (Saudi Sentence Classification)
- [ ] Total items: 40,000 sentences
- [ ] Classification task: Detect "Sunnah" (سنية) in sentences
- [ ] Languages: Arabic (Saudi dialect)

## Branding Elements ✅
- [x] Logo design/upload (animated water jar)
- [x] Color palette (Saudi theme)
- [x] Typography (Arabic fonts)
- [x] UI components styling
- [x] Landing page
- [ ] Login page customization
