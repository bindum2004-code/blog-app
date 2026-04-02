# Inkwell Backend — Setup Guide

Complete step-by-step guide to get the Inkwell backend running with Supabase.

---

## Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) account
- The Inkwell frontend (`inkwell-upgraded/`)

---

## Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a name (e.g. `inkwell`), set a strong database password, pick a region
3. Wait ~2 minutes for provisioning

---

## Step 2 — Run the SQL Migrations

Open **SQL Editor** in your Supabase dashboard and run each file in order:

### 2a. Schema + RLS
Copy the contents of `supabase/migrations/001_schema.sql` → paste → **Run**

This creates all tables, triggers, indexes and Row Level Security policies.

### 2b. Seed data
Copy `supabase/migrations/002_seed.sql` → paste → **Run**

This inserts the 6 default categories, 10 tags and default site settings.

---

## Step 3 — Create the Storage Bucket

1. Supabase Dashboard → **Storage** → **New bucket**
2. Name: `inkwell-media`
3. Toggle **Public bucket** ON → **Save**

Then run the storage policies:

Copy `supabase/migrations/003_storage.sql` → SQL Editor → **Run**

---

## Step 4 — Create Test Users

1. Supabase Dashboard → **Authentication** → **Users** → **Add user**
2. Create these three accounts (uncheck "Send email"):

| Email | Password | Role |
|---|---|---|
| admin@inkwell.com | Admin@123 | (set below) |
| editor@inkwell.com | Editor@123 | (set below) |
| viewer@inkwell.com | Viewer@123 | (set below) |

3. After creating each user, **copy their UUID** from the Users table.

4. In **SQL Editor**, run this (replace the UUIDs):

```sql
-- Admin
UPDATE profiles SET
  username = 'elena',
  first_name = 'Elena',
  last_name = 'Voss',
  bio = 'Platform editor-in-chief. Building the future of digital publishing.',
  role = 'administrator',
  verified = true
WHERE id = 'PASTE_ADMIN_UUID_HERE';

-- Editor
UPDATE profiles SET
  username = 'morgan',
  first_name = 'Morgan',
  last_name = 'Wells',
  bio = 'Senior writer covering tech and design.',
  role = 'editor',
  verified = true
WHERE id = 'PASTE_EDITOR_UUID_HERE';

-- Author
UPDATE profiles SET
  username = 'sam',
  first_name = 'Sam',
  last_name = 'Park',
  bio = 'Avid reader.',
  role = 'viewer'
WHERE id = 'PASTE_VIEWER_UUID_HERE';
```

---

## Step 5 — Configure the Backend

```bash
cd inkwell-backend
cp .env.example .env
```

Open `.env` and fill in your values:

```env
NODE_ENV=development
PORT=4000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJ...          # Project Settings → API → anon public
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Project Settings → API → service_role secret
FRONTEND_URL=http://localhost:3000
```

> **Where to find the keys:**
> Supabase Dashboard → **Project Settings** → **API**
> - `SUPABASE_URL` = Project URL
> - `SUPABASE_ANON_KEY` = `anon` `public` key
> - `SUPABASE_SERVICE_ROLE_KEY` = `service_role` `secret` key ⚠️ Never expose this to clients

---

## Step 6 — Install and Start the Backend

```bash
npm install
npm run dev
```

You should see:
```
🖋  Inkwell API running on port 4000
   Environment : development
   Supabase URL: https://your-project-ref.supabase.co…
```

Test it:
```bash
curl http://localhost:4000/health
# {"status":"ok","env":"development","timestamp":"..."}
```

---

## Step 7 — Seed Sample Posts (Optional)

Open `src/utils/seeder.js` and replace the three UUID placeholders:

```js
const ADMIN_ID  = "PASTE_ADMIN_UUID_HERE";
const EDITOR_ID = "PASTE_EDITOR_UUID_HERE";
const VIEWER_ID = "PASTE_VIEWER_UUID_HERE";
```

Then run:
```bash
npm run seed
```

This creates 5 sample posts, likes, comments and audit log entries.

---

## Step 8 — Connect the Frontend

In the `inkwell-upgraded` frontend, create a `.env` file:

```env
REACT_APP_API_URL=http://localhost:4000/api
```

The frontend's `src/services/api.js` handles all communication with the backend.
To switch from mock data to the real API, update the context files to call `api.*` instead of using local state.

---

## API Reference

### Base URL
```
http://localhost:4000/api
```

### Authentication
All protected routes require:
```
Authorization: Bearer <access_token>
```

Tokens are obtained from `/auth/login` or `/auth/register`.

---

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Register new account |
| POST | `/auth/login` | — | Login, returns tokens |
| POST | `/auth/logout` | ✓ | Logout |
| POST | `/auth/refresh` | — | Refresh access token |
| GET  | `/auth/me` | ✓ | Get current user |
| POST | `/auth/forgot-password` | — | Send reset email |
| POST | `/auth/reset-password` | — | Set new password |

**Register body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass1",
  "username": "myhandle",
  "first_name": "Jane",
  "last_name": "Doe",
  "bio": "Optional short bio"
}
```

**Login body:**
```json
{ "email": "user@example.com", "password": "SecurePass1" }
```

**Login response:**
```json
{
  "success": true,
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "user": { "id": "uuid", "username": "myhandle", "role": "viewer", ... }
}
```

---

### Post Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/posts` | optional | List posts (paginated) |
| GET    | `/posts/:slug` | optional | Get single post |
| POST   | `/posts` | editor+ | Create post |
| PATCH  | `/posts/:id` | owner/admin | Update post |
| DELETE | `/posts/:id` | owner/admin | Delete post |
| POST   | `/posts/:id/like` | ✓ | Toggle like |
| POST   | `/posts/:id/bookmark` | ✓ | Toggle bookmark |
| POST   | `/posts/:id/publish` | admin | Publish post |
| POST   | `/posts/:id/reject` | admin | Reject post |

**Query params for `GET /posts`:**
```
page=1&limit=10
status=published|draft|pending_review
category=<id>
tag=<id>
author=<uuid>
featured=true
search=ambient computing
sort=published_at:desc|views:desc|like_count:desc
```

**Create/update post body:**
```json
{
  "title": "My Article",
  "excerpt": "Short summary",
  "content": "Full content...",
  "status": "draft",
  "featured": false,
  "featured_image": "tech",
  "read_time": 5,
  "categories": [1, 2],
  "tags": ["React", "UI/UX"],
  "meta_title": "SEO title",
  "meta_desc": "SEO description",
  "scheduled_at": null
}
```

---

### Comment Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/posts/:postId/comments` | optional | List comments (nested) |
| POST   | `/posts/:postId/comments` | ✓ | Create comment |
| PATCH  | `/comments/:id` | owner/admin | Update comment |
| DELETE | `/comments/:id` | owner/admin | Delete comment |
| POST   | `/comments/:id/like` | ✓ | Toggle like |
| PATCH  | `/comments/:id/moderate` | admin | Change status |

**Create comment body:**
```json
{ "content": "Great article!", "parent_id": null }
```

**Comment list response** (comments include nested replies):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "content": "Great article!",
      "like_count": 3,
      "liked_by_me": false,
      "author": { "id": "uuid", "username": "sam", "first_name": "Sam", ... },
      "replies": [
        { "id": "uuid", "content": "Thanks!", "author": { ... }, ... }
      ]
    }
  ]
}
```

---

### User Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/users` | admin | List all users |
| GET    | `/users/:id` | optional | Get user profile |
| PATCH  | `/users/me` | ✓ | Update own profile |
| POST   | `/users/me/avatar` | ✓ | Upload avatar image |
| POST   | `/users/:id/follow` | ✓ | Toggle follow |
| GET    | `/users/me/bookmarks` | ✓ | Get bookmarks |
| GET    | `/users/:id/posts` | optional | Get user's posts |

---

### Admin Endpoints (administrator only)

| Method | Path | Description |
|--------|------|-------------|
| PATCH  | `/admin/users/:id/role` | Change user role |
| PATCH  | `/admin/users/:id/status` | Suspend/activate user |
| GET    | `/admin/audit-logs` | Get audit log |
| GET    | `/admin/pending-posts` | Posts awaiting review |
| GET    | `/admin/comments/pending` | Comments awaiting moderation |
| GET    | `/admin/settings` | Get site settings |
| PATCH  | `/admin/settings` | Update site settings |

---

### Analytics Endpoints (editor+)

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/analytics/overview` | Platform stats |
| GET    | `/analytics/top-posts` | Top posts by metric |
| GET    | `/analytics/posts-by-status` | Post status breakdown |
| GET    | `/analytics/users-by-role` | User role breakdown |
| GET    | `/analytics/posts-over-time` | Publishing frequency |
| GET    | `/analytics/top-categories` | Most used categories |

---

### Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/upload` | editor+ | Upload image → returns public URL |

Send as `multipart/form-data` with field `image`.

---

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "message": "Descriptive error message here"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error / bad request |
| 401 | Not authenticated |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (duplicate email/username) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Database Schema Overview

```
profiles          — extends auth.users (role, bio, followers, etc.)
posts             — articles with status workflow
categories        — taxonomy (Technology, Design, etc.)
tags              — freeform labels
post_categories   — junction: post ↔ categories
post_tags         — junction: post ↔ tags
post_likes        — who liked what
bookmarks         — user saved posts
follows           — user follow graph
comments          — threaded (parent_id for replies)
comment_likes     — comment reactions
audit_logs        — all moderation + admin actions
site_settings     — key-value config store
```

---

## Post Status Workflow

```
draft ──► pending_review ──► published
                         └──► rejected
published ──► archived
```

- **Viewers** can read published posts and leave comments
- **Editors** can create posts (go to `pending_review`), edit own posts
- **Administrators** can publish/reject, edit any post, manage users

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| Global | 200 req / 15 min |
| Auth endpoints | 10 req / 15 min |
| Comments | 5 req / 1 min |
| Uploads | 30 req / 1 hour |

---

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use a strong `SUPABASE_SERVICE_ROLE_KEY` — never commit it
- [ ] Set `FRONTEND_URL` to your production domain for CORS
- [ ] Enable email confirmations in Supabase Auth settings
- [ ] Configure Supabase email templates (verification, reset)
- [ ] Set up Supabase database backups (Project Settings → Database)
- [ ] Add server-side monitoring (Sentry, Logtail, etc.)
- [ ] Put the API behind a reverse proxy (nginx / Caddy)
- [ ] Consider deploying to Railway, Render, or Fly.io

---

## Common Issues

**"Missing Supabase env vars"**
→ Make sure `.env` exists and has all three Supabase keys.

**"Profile not found" after register**
→ The `handle_new_auth_user` trigger may not be installed. Re-run `001_schema.sql`.

**Posts not showing on frontend**
→ RLS is blocking unauthenticated reads. Ensure the "Published posts are public" policy is active.

**Upload fails with 403**
→ Create the `inkwell-media` bucket and run `003_storage.sql`.

**CORS error**
→ Set `FRONTEND_URL` in `.env` to match your React app's exact origin (e.g. `http://localhost:3000`).
