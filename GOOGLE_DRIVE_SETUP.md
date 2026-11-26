# Workly &mdash; Google Drive Backend Integration Guide

This guide details the Google Drive API v3 backend integration for **Workly**, including OAuth 2.0 configuration, token persistence, folder hierarchy management, connection testing, and production deployment on Render.

---

## 1. Architecture & Technology Stack

- **Framework:** Express.js / Node.js
- **Primary Data Store:** Excel workbook (`backend/tasks.xlsx`) using ExcelJS with atomic write queuing.
- **File Storage:** Google Drive API v3 (official `googleapis` npm package).
- **Multipart Processing:** Multer (in-memory streaming with strict type & size validation).
- **Two-Way Communication:**
  - `Admin_to_User`: Administrative briefs, specifications, and project documents.
  - `User_to_Admin`: Deliverables, completion reports, screenshots, and proof of work.

---

## 2. Google Drive Folder Hierarchy

Workly automatically builds and maintains the following folder structure in Google Drive:

```
Workly/
├── Admin_to_User/
│   ├── TASK_1795675000079/
│   │   └── architecture_blueprint.pdf
│   └── TASK_1795675000080/
└── User_to_Admin/
    ├── TASK_1795675000079/
    │   └── progress_report.docx
    └── TASK_1795675000080/
```

- **Root Folder:** `Workly` (or custom root configured via `GOOGLE_DRIVE_ROOT_FOLDER_ID`).
- **Direction Folders:** `Admin_to_User` and `User_to_Admin`.
- **Task Folders:** `TASK_<taskId>` created dynamically on the first upload to a task.
- **Privacy:** Folders and files are strictly private (no public sharing links or open permissions are created).

---

## 3. Required Environment Variables

Configure these variables in your `backend/.env` file for local development, and in your Render Service Dashboard under **Environment**:

```env
# OAuth 2.0 Credentials from Google Cloud Console
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret

# Redirect URI (must exactly match Google Cloud Console)
# Local:
GOOGLE_REDIRECT_URI=http://localhost:5000/api/google-drive/callback
# Production (Render):
# GOOGLE_REDIRECT_URI=https://<your-render-backend-url>/api/google-drive/callback

# Permanent Offline Refresh Token (obtained via /api/google-drive/auth)
GOOGLE_REFRESH_TOKEN=

# Optional: Pre-existing Google Drive Root Folder ID (leave blank to auto-create 'Workly')
GOOGLE_DRIVE_ROOT_FOLDER_ID=

# Server Configuration
PORT=5000
FRONTEND_URL=http://localhost:5173
```

> [!IMPORTANT]
> Never commit `backend/.env` to Git. `.env` is ignored by `.gitignore`. Credentials and tokens are never returned in frontend API responses or browser redirects.

---

## 4. Google Cloud Console Configuration (Manual Steps)

Follow these manual steps in the [Google Cloud Console](https://console.cloud.google.com/):

### Step 1: Create Project & Enable API
1. Select or create a Google Cloud Project (e.g. `Workly-Storage`).
2. Navigate to **APIs & Services > Library**.
3. Search for **Google Drive API** and click **Enable**.

### Step 2: Configure OAuth Consent Screen
1. Navigate to **APIs & Services > OAuth consent screen**.
2. Select **External** user type and click **Create**.
3. App Name: `Workly`
4. User support email: Select your email.
5. Developer contact information: Enter your email.
6. Click **Save and Continue**.
7. Under **Scopes**, click **Add or Remove Scopes**, filter for and add:
   `https://www.googleapis.com/auth/drive.file`
8. Click **Update** then **Save and Continue**.
9. Under **Test Users**, click **+ Add Users** and enter the Gmail address that will own the Workly files. Click **Save and Continue**.

### Step 3: Create OAuth 2.0 Web Client Credentials
1. Navigate to **APIs & Services > Credentials**.
2. Click **+ Create Credentials > OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Workly Backend`.
5. Under **Authorized redirect URIs**, add:
   - For Local Development:
     `http://localhost:5000/api/google-drive/callback`
   - For Production (Render):
     `https://<your-render-app-name>.onrender.com/api/google-drive/callback`
6. Click **Create** and copy your **Client ID** and **Client Secret**.

---

## 5. Endpoints & Token Authorization Flow

### 1. `GET /api/google-drive/auth`
- Generates the Google OAuth authorization URL requesting offline access (`access_type: 'offline'`, `prompt: 'consent'`) with the `drive.file` scope.
- Generates a secure CSRF state token stored in backend memory with a 15-minute expiration.
- Redirects the browser directly to Google's authentication page.
- *(Optional query `?json=true` returns `{ authUrl, redirectUri, state }` for programmatic or API client use).*

### 2. `GET /api/google-drive/callback`
- Validates the CSRF `state` parameter to prevent cross-site request forgery.
- Exchanges the authorization `code` with Google's OAuth token endpoint.
- Obtains the permanent `refresh_token`.
- Automatically executes the **Multi-Layer Token Persistence Strategy**:
  1. Sets `process.env.GOOGLE_REFRESH_TOKEN` in memory.
  2. Saves the token in `backend/tasks.xlsx` in the `Settings` worksheet.
  3. Updates `backend/.env` file if it exists locally.
  4. Re-initializes `googleDriveService` with the new token.
  5. Auto-provisions the `Workly/`, `Admin_to_User/`, and `User_to_Admin/` folder structure.
- Displays a clean success page to the user without exposing the secret token.

### 3. `GET /api/google-drive/test`
- Protected verification endpoint.
- Tests:
  - Client ID and Client Secret availability.
  - Refresh token validity.
  - Google Drive API v3 connectivity (`drive.about.get`).
  - Workly folder hierarchy accessibility.
- Returns a structured JSON response:
  ```json
  {
    "connected": true,
    "status": "active",
    "message": "Google Drive API v3 connected and Workly folder hierarchy verified successfully.",
    "authenticatedUser": "user@gmail.com",
    "folders": {
      "root": { "name": "Workly", "id": "1abc..." },
      "adminToUser": { "name": "Admin_to_User", "id": "1def..." },
      "userToAdmin": { "name": "User_to_Admin", "id": "1ghi..." }
    },
    "timestamp": "2026-11-26T10:00:00.000Z"
  }
  ```

---

## 6. Token Persistence Across Server Restarts & Render Deployments

To ensure the refresh token persists across server restarts and Render re-deployments without relying on temporary container filesystems:

1. **Excel Settings Worksheet (`backend/tasks.xlsx`):**
   - Workly maintains a `Settings` worksheet with `Key`, `Value`, and `Updated_At`.
   - When authorization completes, `GOOGLE_REFRESH_TOKEN` is recorded directly into `tasks.xlsx`.
   - On server startup (`initExcel()`), if `process.env.GOOGLE_REFRESH_TOKEN` is unset, the server automatically reads the token from the `Settings` worksheet.
2. **Render Environment Variables (Recommended for Production):**
   - Copy the refresh token and add it to your Render Web Service dashboard under **Environment**:
     - Key: `GOOGLE_REFRESH_TOKEN`
     - Value: `<your-refresh-token>`
   - Render environment variables are permanent across all builds and re-deployments.

---

## 7. OAuth Testing Mode vs Production Publishing

> [!WARNING]
> In Google Cloud Console, while the **OAuth consent screen** is set to **Publishing status: Testing**, Google automatically expires refresh tokens after **7 days** for external test users.

### To Make Tokens Permanent (Never Expire):
1. In Google Cloud Console, navigate to **APIs & Services > OAuth consent screen**.
2. Click **Publish App** under Publishing Status.
3. Because Workly only uses the restricted per-file scope `https://www.googleapis.com/auth/drive.file` (and not full drive access `drive`), Google does **NOT** require a full commercial security assessment or video verification.
4. Once published, your refresh token will never expire.

---

## 8. Local Commands & Verification

### Run the Backend Server:
```powershell
node backend/server.js
```

### Complete OAuth Authorization in Browser:
Visit:
```
http://localhost:5000/api/google-drive/auth
```
Sign in with your authorized test Gmail account and grant file access.

### Verify Google Drive Connectivity:
Visit:
```
http://localhost:5000/api/google-drive/test
```
You should see `"connected": true` and `"status": "active"`.

### Run Automated Backend Test Suite:
```powershell
node backend/test_drive_endpoints.js
```
All 7 integration tests will execute and verify authorization, CSRF rejection, Excel settings persistence, folder resolution, and existing task/user routes.
