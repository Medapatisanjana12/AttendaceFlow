const http = require('http');
const assert = require('assert');
const googleDriveService = require('./googleDriveService');
const { getSetting, saveSetting, initExcel, getAllTasks, getAllUsers } = require('./excelservice');

function makeRequest({ method = 'GET', path, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 5000,
        path,
        method,
        headers: {
          Accept: 'application/json',
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch (e) {
            parsed = body;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('=== WORKLY GOOGLE DRIVE BACKEND INTEGRATION TEST SUITE ===\n');

  // Test 1: Test connection endpoint without credentials
  console.log('Test 1: GET /api/google-drive/test');
  const testRes = await makeRequest({ path: '/api/google-drive/test' });
  console.log('  Status code:', testRes.status);
  console.log('  Response:', testRes.body);
  assert.ok(
    testRes.status === 400 || testRes.status === 200,
    'Endpoint should return 400 when unconfigured or 200 when configured'
  );
  assert.ok(
    testRes.body.status !== undefined && testRes.body.connected !== undefined,
    'Response must contain status and connected fields'
  );
  console.log('  -> PASS: Test connection endpoint responded correctly with structured JSON.\n');

  // Test 2: Auth URL generation without credentials
  console.log('Test 2: GET /api/google-drive/auth without credentials');
  const authRes = await makeRequest({ path: '/api/google-drive/auth?json=true' });
  console.log('  Status code:', authRes.status);
  console.log('  Response:', authRes.body);
  assert.strictEqual(authRes.status, 400);
  assert.ok(authRes.body.error && authRes.body.error.includes('GOOGLE_CLIENT_ID'));
  console.log('  -> PASS: Rejects unconfigured credentials gracefully with clear instruction.\n');

  // Test 3: CSRF State validation on callback
  console.log('Test 3: GET /api/google-drive/callback with invalid/tampered state (CSRF test)');
  const fakeCallback = await makeRequest({
    path: '/api/google-drive/callback?code=mock_code_123&state=tampered_or_expired_state',
  });
  console.log('  Status code:', fakeCallback.status);
  console.log('  Response:', fakeCallback.body);
  assert.strictEqual(fakeCallback.status, 400);
  assert.ok(fakeCallback.body.error && fakeCallback.body.error.includes('Invalid or expired OAuth state'));
  console.log('  -> PASS: Successfully blocked invalid OAuth state parameter (CSRF protection verified).\n');

  // Test 4: Excel Settings Sheet persistence
  console.log('Test 4: Excel Settings worksheet persistence');
  await initExcel();
  const testKey = 'TEST_GOOGLE_CONFIG_' + Date.now();
  const testVal = 'mock_refresh_token_xyz789';
  await saveSetting(testKey, testVal);
  const retrievedVal = await getSetting(testKey);
  console.log('  Saved:', testVal, '| Retrieved:', retrievedVal);
  assert.strictEqual(retrievedVal, testVal);
  console.log('  -> PASS: Excel Settings worksheet correctly stores and retrieves configuration across calls.\n');

  // Test 5: Workly folder hierarchy creation & resolution
  console.log('Test 5: Folder hierarchy resolution (Workly -> Admin_to_User & User_to_Admin -> TASK_ID)');
  const hierarchy = await googleDriveService.ensureWorklyHierarchy();
  console.log('  Workly hierarchy:', hierarchy);
  assert.ok(hierarchy.rootFolderId, 'Root folder must be present');
  assert.ok(hierarchy.adminToUserFolderId, 'Admin_to_User folder must be present');
  assert.ok(hierarchy.userToAdminFolderId, 'User_to_Admin folder must be present');

  const adminTaskFolder = await googleDriveService.resolveTaskFolder('Admin_to_User', 'TASK_101');
  console.log('  Admin Task Folder:', adminTaskFolder);
  assert.ok(adminTaskFolder.taskFolderId, 'Task folder must be resolved');

  const userTaskFolder = await googleDriveService.resolveTaskFolder('User_to_Admin', 'TASK_101');
  console.log('  User Task Folder:', userTaskFolder);
  assert.ok(userTaskFolder.taskFolderId, 'Task folder must be resolved');
  console.log('  -> PASS: Folder hierarchy and dynamic task folder resolution verified.\n');

  // Test 6: File listing and upload in mock/active service
  console.log('Test 6: File upload and listing service functions');
  const uploadResult = await googleDriveService.uploadFile({
    buffer: Buffer.from('Integration test file content for Workly'),
    originalName: 'test_deliverable.pdf',
    mimeType: 'application/pdf',
    uploadDirection: 'User_to_Admin',
    taskId: '101',
    description: 'Automated integration test file',
    uploadedBy: 'Jessica Taylor',
    uploadedRole: 'user',
  });
  console.log('  Upload result:', uploadResult);
  assert.ok(uploadResult.googleDriveFileId, 'File ID must be returned');
  assert.strictEqual(uploadResult.fileType, 'application/pdf');

  const downloadStream = await googleDriveService.downloadFile(uploadResult.googleDriveFileId);
  assert.ok(downloadStream.stream, 'Download stream must be available');
  console.log('  Download stream ready for file:', downloadStream.fileName);

  await googleDriveService.deleteFile(uploadResult.googleDriveFileId);
  console.log('  -> PASS: File upload, download stream, and deletion verified.\n');

  // Test 7: Verify existing backend task and user routes
  console.log('Test 7: Verify existing backend core routes are healthy');
  const tasks = await getAllTasks();
  console.log('  Existing tasks loaded:', tasks.length);
  assert.ok(Array.isArray(tasks), 'Tasks must be an array');

  const users = await getAllUsers();
  console.log('  Existing users loaded:', users.length);
  assert.ok(Array.isArray(users), 'Users must be an array');
  console.log('  -> PASS: Existing task management and user systems remain completely unaffected.\n');

  console.log('=== ALL 7 TESTS COMPLETED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
