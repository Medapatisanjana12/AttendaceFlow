# Workly — Google Drive Attachment Management Integration Guide

This guide documents the setup, architecture, and operation of the Google Drive attachment management system in **Workly**.

---

## 1. Architecture Overview

Workly utilizes a hybrid architecture:
- **Database / Structured Metadata:** Master Excel workbook (`backend/tasks.xlsx`), managed via ExcelJS with an atomic write queue.
- **Physical File Storage:** Google Drive (via Google Drive API v3 and `googleapis` npm package).
- **Frontend Interface:** Modular React component `AttachmentManager.jsx` with real-time Socket.io events.
- **Two-way Communication:**
  - **Admin to User (`Admin_to_User`):** Reference documents, project briefs, specifications, and templates uploaded by administrators.
  - **User to Admin (`User_to_Admin`):** Progress deliverables, proof of work, screenshots, and completion reports submitted by team members.

---

## 2. Google Drive Folder Hierarchy

When files are uploaded, Workly dynamically structures the folders in the dedicated Google account's Google Drive:

```
Workly/
├── Admin_to_User/
│   ├── TASK_1732612345000/
│   │   ├── Project_Brief.pdf
│   │   └── Architecture_Diagram.png
│   └── TASK_1732612346000/
└── User_to_Admin/
    ├── TASK_1732612345000/
    │   ├── Final_Report.docx
    │   └── Test_Results.xlsx
    └── TASK_1732612346000/
```

- **Root Folder:** Named `Workly`. Dynamically discovered or created if missing.
- **Direction Folders:** `Admin_to_User` and `User_to_Admin` separate authority boundaries.
- **Task Folders:** Dynamically created on first upload to that task (`TASK_<taskId>`), preventing folder duplication through an in-memory folder cache.

---

## 3. Excel Metadata Schema (`Attachments` Sheet)

All metadata is stored in `backend/tasks.xlsx` in the `Attachments` worksheet:

| Column | Field Name | Description |
|---|---|---|
| 1 | `Attachment_ID` | Unique identifier (e.g., `att_1732612345000_abc123`) |
| 2 | `Task_ID` | Associated Task ID |
| 3 | `File_Name` | Sanitized file name stored on Drive |
| 4 | `Original_File_Name` | Original uploaded file name |
| 5 | `File_Type` | MIME type (e.g. `application/pdf`, `image/png`) |
| 6 | `File_Size` | Size in bytes |
| 7 | `Uploaded_By` | Name or email of uploader |
| 8 | `Uploaded_Role` | `admin` or `user` |
| 9 | `Upload_Direction` | `Admin_to_User` or `User_to_Admin` |
| 10 | `Google_Drive_File_ID` | File ID returned by Google Drive API |
| 11 | `Google_Drive_Folder_ID` | Parent task folder ID in Google Drive |
| 12 | `Uploaded_Date` | ISO 8601 timestamp |
| 13 | `Description` | Optional notes or deliverable summary |

---

## 4. Google Cloud Console Setup

To obtain your OAuth 2.0 credentials:

### Step 1: Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **New Project**.
3. Name it **Workly Storage** and click **Create**.

### Step 2: Enable Google Drive API v3
1. Navigate to **APIs & Services > Library**.
2. Search for `Google Drive API`.
3. Select **Google Drive API** and click **Enable**.

### Step 3: Configure OAuth Consent Screen
1. Navigate to **APIs & Services > OAuth consent screen**.
2. Choose **External** user type and click **Create**.
3. Fill in:
   - **App name:** `Workly`
   - **User support email:** Your email
   - **Developer contact information:** Your email
4. Click **Save and Continue**.
5. On the **Scopes** page, click **Add or Remove Scopes**.
6. Filter for or manually enter:
   `https://www.googleapis.com/auth/drive.file`
   *(This scope limits Workly's access strictly to files and folders created by Workly, ensuring maximum privacy and security.)*
7. Click **Update** and then **Save and Continue**.
8. On the **Test users** page, add the Google Account that will own the Workly files. Click **Save and Continue**.

### Step 4: Create OAuth 2.0 Client Credentials
1. Navigate to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Workly Web Client`.
5. Under **Authorized redirect URIs**, add:
   - Local: `http://localhost:5000/oauth2callback`
   - Render (Production): `https://<your-render-backend-url>/oauth2callback`
6. Click **Create**.
7. Copy your **Client ID** and **Client Secret**.

---

## 5. Generating Your Refresh Token

Workly comes with a built-in OAuth helper to generate your refresh token in seconds without third-party tools:

1. In `backend/.env`, set:
   ```env
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/oauth2callback
   ```
2. Start the backend: `node backend/server.js`.
3. Open your browser and navigate to:
   `http://localhost:5000/api/drive/auth-url`
4. Click the generated authorization URL, sign in with your Google account, and grant access to Workly.
5. Google will redirect back to `/oauth2callback`, which will display your **Refresh Token** on screen.
6. Copy the Refresh Token and add it to `GOOGLE_REFRESH_TOKEN` in your `backend/.env`.

---

## 6. Environment Variables Reference

Add these variables to your local `backend/.env` and to your Render Dashboard under **Environment**:

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret from Google Cloud Console |
| `GOOGLE_REFRESH_TOKEN` | Generated permanent offline refresh token |
| `GOOGLE_REDIRECT_URI` | Configured redirect URI (`/oauth2callback`) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | *(Optional)* Pre-created folder ID for `Workly` root |

> [!NOTE]
> If Google Drive credentials are not yet configured, Workly automatically falls back to secure local mock storage under `backend/uploads/google_drive_storage/`, ensuring development and testing never crash.

---

## 7. Security & Access Control Policies

1. **Server-Side Authorization:** Every attachment request verifies task ownership and roles.
   - Admins can access, upload, and delete attachments for any task.
   - Team members can only access tasks assigned to them.
   - Team members cannot delete files uploaded by admins.
2. **File Restrictions:**
   - Maximum file size: **10 MB**.
   - Permitted formats: `.pdf`, `.jpeg`, `.jpg`, `.png`, `.webp`, `.doc`, `.docx`, `.xls`, `.xlsx`.
   - MIME types and file extensions are verified.
3. **Rollback Safety:** If an attachment uploads to Google Drive but the metadata write to `tasks.xlsx` fails, the uploaded Drive file is automatically deleted (rolled back) to prevent orphaned files.
4. **Streaming Downloads:** Download endpoints stream files directly from Drive with sanitized `Content-Disposition` headers, preventing disk accumulation on serverless or ephemeral filesystems (Render).
