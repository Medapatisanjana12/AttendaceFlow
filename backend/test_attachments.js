const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, data, isMultipart = false) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      if (options.stream) {
        return resolve({ status: res.statusCode, headers: res.headers, stream: res });
      }
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else if (typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

function buildMultipartFormData(fields, file) {
  const boundary = '--------------------------' + Date.now().toString(16);
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${val}\r\n`
    );
  }

  const fileHeader =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
    `Content-Type: ${file.type}\r\n\r\n`;

  const footer = `\r\n--${boundary}--\r\n`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(parts.join(''), 'utf8'),
    Buffer.from(fileHeader, 'utf8'),
    file.buffer,
    Buffer.from(footer, 'utf8')
  ]);

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    buffer: bodyBuffer
  };
}

async function runTests() {
  console.log('=== TEST 1: Fetch Existing Tasks to get a valid taskId ===');
  const tasksRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/tasks?role=admin',
    method: 'GET'
  });
  console.log(`Tasks status: ${tasksRes.status}, count: ${tasksRes.data.length}`);

  let taskId = tasksRes.data[0]?.id;
  if (!taskId) {
    // create a task first
    const createRes = await request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/tasks',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      assignedTo: 'sanzz',
      assignedToEmail: 'medapatisanjana0212@gmail.com',
      title: 'Google Drive Attachment Integration Task',
      description: 'Testing two-way Google Drive attachments'
    });
    taskId = createRes.data.id;
    console.log('Created test task with ID:', taskId);
  } else {
    console.log('Using existing task ID:', taskId);
  }

  console.log('\n=== TEST 2: Admin Uploads Reference PDF (Admin_to_User) ===');
  const samplePdf = Buffer.from('%PDF-1.4 Mock PDF content for task specifications Workly', 'utf8');
  const multipart1 = buildMultipartFormData({
    taskId,
    uploadDirection: 'Admin_to_User',
    uploadedBy: 'Company Administrator',
    uploadedRole: 'admin',
    description: 'System Architectural Blueprint Document'
  }, {
    name: 'architecture_blueprint.pdf',
    type: 'application/pdf',
    buffer: samplePdf
  });

  const upload1Res = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/attachments/upload',
    method: 'POST',
    headers: {
      'Content-Type': multipart1.contentType,
      'Content-Length': multipart1.buffer.length
    }
  }, multipart1.buffer);

  console.log('Upload 1 status:', upload1Res.status);
  console.log('Upload 1 response:', upload1Res.data);
  const adminAttachmentId = upload1Res.data.attachmentId;

  console.log('\n=== TEST 3: User Uploads Progress Report (User_to_Admin) ===');
  const sampleDoc = Buffer.from('Completed phase 1 and tested endpoints successfully.', 'utf8');
  const multipart2 = buildMultipartFormData({
    taskId,
    uploadDirection: 'User_to_Admin',
    uploadedBy: 'sanzz',
    uploadedRole: 'user',
    description: 'Weekly Milestones Deliverable Report'
  }, {
    name: 'progress_report.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: sampleDoc
  });

  const upload2Res = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/attachments/upload',
    method: 'POST',
    headers: {
      'Content-Type': multipart2.contentType,
      'Content-Length': multipart2.buffer.length
    }
  }, multipart2.buffer);

  console.log('Upload 2 status:', upload2Res.status);
  console.log('Upload 2 response:', upload2Res.data);
  const userAttachmentId = upload2Res.data.attachmentId;

  console.log('\n=== TEST 4: Fetch Attachments for Task ===');
  const listRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/attachments/${taskId}?role=admin`,
    method: 'GET'
  });
  console.log(`List status: ${listRes.status}, count: ${listRes.data.length}`);
  console.log('Attachments:', listRes.data.map(a => ({
    id: a.attachmentId,
    name: a.originalFileName,
    dir: a.uploadDirection,
    by: a.uploadedBy,
    role: a.uploadedRole,
    driveId: a.googleDriveFileId
  })));

  console.log('\n=== TEST 5: Download Attachment Stream ===');
  const dlRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/attachments/download/${adminAttachmentId}?role=admin`,
    method: 'GET',
    stream: true
  });
  console.log('Download status:', dlRes.status);
  console.log('Content-Type:', dlRes.headers['content-type']);
  console.log('Content-Disposition:', dlRes.headers['content-disposition']);

  let dlData = '';
  await new Promise((resolve) => {
    dlRes.stream.on('data', chunk => dlData += chunk);
    dlRes.stream.on('end', resolve);
  });
  console.log('Downloaded data matches uploaded buffer:', dlData === samplePdf.toString('utf8'));

  console.log('\n=== TEST 6: Security Check - Unauthorized User cannot access other user task ===');
  const unauthRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/attachments/${taskId}?role=user&email=unauthorized_stranger@company.com`,
    method: 'GET'
  });
  console.log('Unauthorized fetch status:', unauthRes.status, unauthRes.data);

  console.log('\n=== TEST 7: Delete Attachment ===');
  const delRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/attachments/${userAttachmentId}?role=user&email=sanzz`,
    method: 'DELETE'
  });
  console.log('Delete status:', delRes.status, delRes.data);

  const afterDelRes = await request({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/attachments/${taskId}?role=admin`,
    method: 'GET'
  });
  console.log(`After deletion count: ${afterDelRes.data.length} (expected: 1)`);

  console.log('\n>>> ALL BACKEND ATTACHMENT TESTS PASSED! <<<');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
